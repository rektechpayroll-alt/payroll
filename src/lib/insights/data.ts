import { randomUUID } from "node:crypto";
import { getPool, ready } from "@/lib/db";
import { advance } from "@/lib/invoicing/service";
import { ledgerDate } from "@/lib/ledger/posting";
import { accountBalances } from "@/lib/ledger/reports";
import type { PayFrequency } from "@/lib/payroll/engine";
import { currentCompanyId, getSession } from "@/lib/tenant";
import { calculateVatReturn, getVatSettings, vatPeriods } from "@/lib/vat/returns";
import { addDays, buildForecast, daysBetween, hmrcDueDate, typicalLateness, type CashItem, type Forecast } from "./forecast";
import { computeKpis, healthScore, suggestBudget, type LedgerFigures } from "./kpis";

/** Gathers real figures (ledger, open documents, payroll, VAT) for forecasts, KPIs and budgets. */

export class InsightsError extends Error {}

const pence = (pounds: number) => Math.round(pounds * 100);
const todayIso = () => new Date().toISOString().slice(0, 10);
const PAYROLL_COST_ACCOUNTS = ["7000", "7006", "7007"];

// ---------------------------------------------------------------------------------------------
// Cash flow forecast

/** Pay date of a run. Older sample runs only store "Wed 30 Sep" with the year in the label. */
function runPayDate(run: { pay_date: string | null; payday: string; period_label: string }): string | null {
  if (run.pay_date) return run.pay_date;
  const year = run.period_label.match(/\b(20\d{2})\b/)?.[1];
  const parts = run.payday.trim().split(/\s+/);
  if (!year || parts.length < 3) return null;
  const d = new Date(`${parts[1]} ${parts[2]} ${year} 12:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function nextPayDate(date: string, frequency: PayFrequency): string {
  if (frequency === "monthly") return advance(date, "monthly");
  return addDays(date, frequency === "weekly" ? 7 : frequency === "fortnightly" ? 14 : 28);
}

/** The next 22nd on or after a date — when anything already owed to HMRC or the pension scheme falls due. */
function next22nd(date: string): string {
  const day = Number(date.slice(8, 10));
  const d = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - (day <= 22 ? 1 : 0), 22));
  return d.toISOString().slice(0, 10);
}

async function paymentHistory(companyId: string) {
  const { rows } = await getPool().query(
    `SELECT i.customer_name, i.issue_date, i.due_date,
            (SELECT t.txn_date FROM bank_transactions t WHERE t.matched_invoice_id = i.id AND t.company_id = i.company_id ORDER BY t.sort_order DESC LIMIT 1) AS paid_on
     FROM invoices i WHERE i.company_id = $1 AND i.status = 'paid'`,
    [companyId]
  );
  return rows
    .filter((r) => r.paid_on)
    .map((r) => ({ customer: String(r.customer_name).trim().toLowerCase(), issueDate: ledgerDate(r.issue_date), dueDate: ledgerDate(r.due_date), paidOn: ledgerDate(r.paid_on) }));
}

export async function forecastItems(today = todayIso(), days = 180): Promise<{ opening: number; items: CashItem[] }> {
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  const horizon = addDays(today, days);
  const items: CashItem[] = [];

  const balances = await accountBalances(null, today);
  const bal = (code: string) => balances.find((a) => a.code === code)?.balance ?? 0;

  // Customers: expected when they usually pay, not just on the due date.
  const history = await paymentHistory(companyId);
  const overall = typicalLateness(history) ?? 0;
  const latenessFor = (customer: string) => typicalLateness(history.filter((h) => h.customer === customer.trim().toLowerCase())) ?? overall;

  // Drafts count too (as estimates): recurring schedules raise them for you to check and send.
  const { rows: invoices } = await pool.query("SELECT * FROM invoices WHERE company_id = $1 AND status IN ('sent', 'draft')", [companyId]);
  for (const i of invoices) {
    const due = ledgerDate(i.due_date);
    const late = latenessFor(i.customer_name);
    let date = addDays(due, late);
    let note = i.status === "draft" ? " (draft — not sent yet)" : late ? ` (usually pays ${late} days late)` : "";
    if (date < today) {
      date = addDays(today, 7);
      note = i.status === "draft" ? " (draft — overdue, not sent yet)" : " (overdue — assumed within a week)";
    }
    items.push({ date, amount: pence(i.total), label: `${i.invoice_number} ${i.customer_name}${note}`, kind: "invoice", certainty: i.status === "draft" ? "estimated" : "known" });
  }

  const { rows: bills } = await pool.query("SELECT * FROM bills WHERE company_id = $1 AND status = 'unpaid'", [companyId]);
  for (const b of bills) {
    items.push({ date: ledgerDate(b.due_date), amount: -pence(b.total), label: `${b.bill_reference} ${b.supplier_name}`, kind: "bill", certainty: "known" });
  }

  const { rows: recurring } = await pool.query(
    "SELECT *, to_char(next_date, 'YYYY-MM-DD') AS nd, to_char(end_date, 'YYYY-MM-DD') AS ed FROM recurring_invoices WHERE company_id = $1 AND active",
    [companyId]
  );
  for (const r of recurring) {
    const items_ = r.items as Array<{ quantity: number; unitPrice: number }>;
    const net = items_.reduce((s, it) => s + pence(it.quantity * it.unitPrice), 0);
    const gross = net + Math.round((net * r.vat_rate) / 100);
    const late = latenessFor(r.customer_name);
    for (let d = r.nd as string, n = 0; d <= horizon && (!r.ed || d <= r.ed) && n < 60; d = advance(d, r.frequency, r.anchor_day ?? undefined), n++) {
      items.push({ date: addDays(d, r.due_days + late), amount: gross, label: `Recurring invoice — ${r.customer_name}`, kind: "recurring", certainty: "estimated" });
    }
  }

  // Payroll already run: what's still owed sits on the ledger's payroll liability accounts.
  if (bal("2220") > 0) items.push({ date: today, amount: -pence(bal("2220")), label: "Net wages still to pay", kind: "wages", certainty: "known" });
  if (bal("2210") > 0) items.push({ date: next22nd(today), amount: -pence(bal("2210")), label: "PAYE and NI owed to HMRC", kind: "hmrc", certainty: "known" });
  if (bal("2230") > 0) items.push({ date: next22nd(today), amount: -pence(bal("2230")), label: "Pension contributions owed", kind: "pension", certainty: "known" });

  // Pay runs dated after today, then the latest one repeated on its schedule.
  const { rows: runs } = await pool.query(
    `SELECT *, to_char(pay_date, 'YYYY-MM-DD') AS pay_date FROM payroll_runs WHERE company_id = $1 ORDER BY created_at DESC`,
    [companyId]
  );
  const dated = runs.map((r) => ({ ...r, date: runPayDate(r) })).filter((r) => r.date) as Array<Record<string, number & string> & { date: string }>;
  const payrollOut = (r: Record<string, number>, date: string, certainty: CashItem["certainty"], label: string) => {
    // Older sample runs only hold totals; their employee deductions are what's between gross and net.
    const deducted = r.total_tax + r.total_employee_ni + r.total_student_loan || Math.max(0, r.gross_pay - r.net_pay - r.total_employee_pension);
    const hmrc = deducted + r.employer_ni - r.statutory_recovered - r.employment_allowance_used;
    const pension = r.total_employee_pension + r.employer_pension;
    items.push({ date, amount: -pence(r.net_pay), label: `Net pay — ${label}`, kind: "wages", certainty });
    if (hmrc > 0) items.push({ date: hmrcDueDate(date), amount: -pence(hmrc), label: `PAYE and NI — ${label}`, kind: "hmrc", certainty });
    if (pension > 0) items.push({ date: hmrcDueDate(date), amount: -pence(pension), label: `Pensions — ${label}`, kind: "pension", certainty });
  };
  for (const r of dated.filter((r) => r.date > today)) payrollOut(r, r.date, "known", r.period_label);
  const template = [...dated].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (template) {
    const frequency = (template.frequency as PayFrequency | null) ?? "monthly";
    for (let d = nextPayDate(template.date, frequency), n = 0; d <= horizon && n < 60; d = nextPayDate(d, frequency), n++) {
      if (d > today) payrollOut(template, d, "estimated", `payroll on ${d}`);
    }
  }

  // VAT returns falling due in the window.
  const vat = await getVatSettings();
  if (vat.vat_registered) {
    for (const p of await vatPeriods(today)) {
      if (p.status === "submitted" || p.dueDate < today || p.dueDate > horizon) continue;
      const boxes = p.boxes ?? (await calculateVatReturn(p.start, p.end)).boxes;
      const amount = boxes.payable ? -boxes.box5 : boxes.box5;
      items.push({
        date: boxes.payable ? p.dueDate : addDays(p.dueDate, 10),
        amount,
        label: `VAT return ${p.start} to ${p.end}${p.status === "open" ? " (so far)" : ""}`,
        kind: "vat",
        certainty: p.status === "open" ? "estimated" : "known",
      });
    }
  }

  // Regular income and spending posted straight from the bank, repeated monthly.
  const since = addDays(today, -90);
  const { rows: bankLines } = await pool.query(
    `SELECT t.txn_date, t.amount, t.direction, t.account_code, a.name, a.type FROM bank_transactions t
     JOIN gl_accounts a ON a.company_id = t.company_id AND a.code = t.account_code
     WHERE t.company_id = $1 AND t.status = 'matched' AND a.type IN ('income', 'expense')`,
    [companyId]
  );
  const byAccount = new Map<string, { name: string; total: number; months: Set<string>; lastDay: number }>();
  for (const t of bankLines) {
    const date = ledgerDate(t.txn_date);
    if (date < since || date > today) continue;
    if (template && PAYROLL_COST_ACCOUNTS.includes(t.account_code)) continue;
    const signed = t.direction === "credit" ? t.amount : -t.amount;
    const a = byAccount.get(t.account_code) ?? { name: t.name, total: 0, months: new Set(), lastDay: 1 };
    a.total += signed;
    a.months.add(date.slice(0, 7));
    a.lastDay = Number(date.slice(8, 10));
    byAccount.set(t.account_code, a);
  }
  for (const a of byAccount.values()) {
    // Seen in at least two different months, so it's a habit rather than a one-off.
    if (a.months.size < 2 || a.total === 0) continue;
    const monthly = pence(a.total / 3);
    let d = `${today.slice(0, 8)}${String(Math.min(a.lastDay, 28)).padStart(2, "0")}`;
    if (d <= today) d = advance(d, "monthly");
    for (let n = 0; d <= horizon && n < 12; d = advance(d, "monthly"), n++) {
      items.push({ date: d, amount: monthly, label: `${a.name} — usual monthly ${monthly > 0 ? "income" : "spend"}`, kind: "regular", certainty: "estimated" });
    }
  }

  const { rows: manual } = await pool.query("SELECT id, to_char(item_date, 'YYYY-MM-DD') AS d, label, amount FROM cash_forecast_items WHERE company_id = $1", [companyId]);
  for (const m of manual) items.push({ id: m.id, date: m.d, amount: pence(m.amount), label: m.label, kind: "manual", certainty: "estimated" });

  return { opening: pence(bal("1200")), items };
}

export async function cashForecast(days: number, today = todayIso()): Promise<Forecast> {
  if (![30, 60, 90, 180].includes(days)) throw new InsightsError("Forecast 30, 60, 90 or 180 days ahead.");
  const { opening, items } = await forecastItems(today, days);
  return buildForecast(opening, items, today, days);
}

export async function addForecastItem(input: { date: string; label: string; amount: number }): Promise<string> {
  await ready();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new InsightsError("Choose a date.");
  if (!input.label?.trim()) throw new InsightsError("Describe the item.");
  if (!Number.isFinite(input.amount) || input.amount === 0) throw new InsightsError("Enter an amount — negative for money going out.");
  const id = randomUUID();
  await getPool().query("INSERT INTO cash_forecast_items (id, company_id, item_date, label, amount) VALUES ($1, $2, $3, $4, $5)", [
    id,
    await currentCompanyId(),
    input.date,
    input.label.trim().slice(0, 120),
    Math.round(input.amount * 100) / 100,
  ]);
  return id;
}

export async function deleteForecastItem(id: string): Promise<void> {
  await ready();
  const res = await getPool().query("DELETE FROM cash_forecast_items WHERE id = $1 AND company_id = $2", [id, await currentCompanyId()]);
  if (!res.rowCount) throw new InsightsError("That item no longer exists.");
}

// ---------------------------------------------------------------------------------------------
// KPIs and health

export async function ledgerFigures(from: string, to: string): Promise<LedgerFigures> {
  await ready();
  const companyId = await currentCompanyId();
  const days = daysBetween(from, to) + 1;
  const [period, position, prior] = await Promise.all([accountBalances(from, to), accountBalances(null, to), accountBalances(addDays(from, -days), addDays(from, -1))]);
  const sum = (rows: typeof period, pick: (a: (typeof period)[number]) => boolean) => rows.filter(pick).reduce((s, a) => s + a.balance, 0);

  const history = (await paymentHistory(companyId)).filter((h) => h.paidOn >= addDays(to, -365) && h.paidOn <= to);
  const toPay = history.map((h) => Math.max(0, daysBetween(h.issueDate, h.paidOn))).sort((a, b) => a - b);
  const median = toPay.length ? toPay[Math.floor((toPay.length - 1) / 2)] : null;

  return {
    days,
    revenue: sum(period, (a) => a.type === "income"),
    costOfSales: sum(period, (a) => a.type === "expense" && a.code.startsWith("5")),
    expenses: sum(period, (a) => a.type === "expense" && !a.code.startsWith("5")),
    payrollCosts: sum(period, (a) => PAYROLL_COST_ACCOUNTS.includes(a.code)),
    depreciation: sum(period, (a) => a.code === "8000"),
    cash: sum(position, (a) => a.code === "1200"),
    debtors: sum(position, (a) => a.code === "1100"),
    creditors: sum(position, (a) => a.code === "2100"),
    currentAssets: sum(position, (a) => a.type === "asset" && !a.code.startsWith("00")),
    currentLiabilities: sum(position, (a) => a.type === "liability"),
    priorRevenue: sum(prior, (a) => a.type === "income"),
    averageDaysToPay: median,
  };
}

export type InsightPeriod = 1 | 3 | 12;

export function periodRange(months: InsightPeriod, today = todayIso()): { from: string; to: string; label: string } {
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCMonth(from.getUTCMonth() - months);
  return { from: addDays(from.toISOString().slice(0, 10), 1), to: today, label: months === 1 ? "last month" : `last ${months} months` };
}

export async function businessInsights(months: InsightPeriod = 12, today = todayIso()) {
  const { from, to, label } = periodRange(months, today);
  const [figures, forecast] = await Promise.all([ledgerFigures(from, to), cashForecast(90, today)]);
  return { from, to, label, figures, kpis: computeKpis(figures), health: healthScore(figures, forecast.lowest.balance / 100), forecast };
}

/** Income and costs per calendar month, oldest first, for charts. */
export async function monthlyTotals(months = 12, today = todayIso()) {
  await ready();
  // The current month and the (months − 1) before it.
  const start = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - months, 1)).toISOString().slice(0, 10);
  const { rows } = await getPool().query(
    `SELECT to_char(j.journal_date, 'YYYY-MM') AS month, a.type, a.code,
            COALESCE(SUM(l.credit - l.debit), 0)::float8 AS net
     FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
     JOIN gl_accounts a ON a.company_id = j.company_id AND a.code = l.account_code
     WHERE j.company_id = $1 AND j.journal_date >= $2 AND j.journal_date <= $3 AND a.type IN ('income', 'expense')
     GROUP BY 1, 2, 3`,
    [await currentCompanyId(), start, today]
  );
  const out: Array<{ month: string; income: number; costs: number }> = [];
  for (let i = 0; i < months; i++) {
    const m = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + i, 1)).toISOString().slice(0, 7);
    const inMonth = rows.filter((r) => r.month === m);
    out.push({
      month: m,
      income: Math.round(inMonth.filter((r) => r.type === "income").reduce((s, r) => s + r.net, 0) * 100) / 100,
      costs: Math.round(-inMonth.filter((r) => r.type === "expense").reduce((s, r) => s + r.net, 0) * 100) / 100,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Budgets

export type BudgetRow = {
  code: string;
  name: string;
  section: "income" | "costOfSales" | "expenses";
  budget: number[];
  actual: number[];
  suggestion: { amounts: number[]; basis: string };
};

export function yearMonths(start: string): string[] {
  return Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1 + i, 1)).toISOString().slice(0, 7));
}

const monthRe = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Budget against actual for every income and cost account, over 12 months from `start` ("YYYY-MM"). */
export async function budgetYear(start: string): Promise<{ months: string[]; rows: BudgetRow[] }> {
  if (!monthRe.test(start)) throw new InsightsError("Choose a starting month.");
  await ready();
  const companyId = await currentCompanyId();
  const months = yearMonths(start);
  const historyFrom = new Date(Date.UTC(Number(start.slice(0, 4)) - 2, Number(start.slice(5, 7)) - 1, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(Number(start.slice(0, 4)) + 1, Number(start.slice(5, 7)) - 1, 0)).toISOString().slice(0, 10);
  const pool = getPool();

  const [{ rows: accounts }, { rows: moves }, { rows: budgets }] = await Promise.all([
    pool.query("SELECT code, name, type FROM gl_accounts WHERE company_id = $1 AND type IN ('income', 'expense') ORDER BY code", [companyId]),
    pool.query(
      `SELECT l.account_code, to_char(j.journal_date, 'YYYY-MM') AS month, SUM(l.debit - l.credit)::float8 AS dr
       FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
       WHERE j.company_id = $1 AND j.journal_date >= $2 AND j.journal_date <= $3 GROUP BY 1, 2`,
      [companyId, historyFrom, end]
    ),
    pool.query("SELECT account_code, to_char(month, 'YYYY-MM') AS month, amount FROM gl_budgets WHERE company_id = $1 AND month >= $2 AND month <= $3", [companyId, `${start}-01`, end]),
  ]);

  const rows = accounts.map((a) => {
    const sign = a.type === "income" ? -1 : 1;
    const history: Record<string, number> = {};
    for (const m of moves.filter((x) => x.account_code === a.code && x.month < start)) history[m.month] = Math.round(sign * m.dr * 100) / 100;
    return {
      code: a.code,
      name: a.name,
      section: a.type === "income" ? "income" : a.code.startsWith("5") ? "costOfSales" : "expenses",
      budget: months.map((m) => budgets.find((b) => b.account_code === a.code && b.month === m)?.amount ?? 0),
      actual: months.map((m) => Math.round(sign * (moves.find((x) => x.account_code === a.code && x.month === m)?.dr ?? 0) * 100) / 100),
      suggestion: suggestBudget(history, months),
    } as BudgetRow;
  });
  return { months, rows };
}

async function assertBudgetAccount(companyId: string, code: string) {
  const { rowCount } = await getPool().query("SELECT 1 FROM gl_accounts WHERE company_id = $1 AND code = $2 AND type IN ('income', 'expense')", [companyId, code]);
  if (!rowCount) throw new InsightsError("Budgets are set on income and cost accounts.");
}

export async function setBudget(start: string, code: string, amounts: number[]): Promise<void> {
  await ready();
  if (!monthRe.test(start)) throw new InsightsError("Choose a starting month.");
  if (!Array.isArray(amounts) || amounts.length !== 12 || amounts.some((a) => !Number.isFinite(a) || a < 0)) throw new InsightsError("Enter twelve amounts of £0 or more.");
  const companyId = await currentCompanyId();
  await assertBudgetAccount(companyId, code);
  const months = yearMonths(start);
  for (let i = 0; i < 12; i++) {
    const amount = Math.round(amounts[i] * 100) / 100;
    if (amount === 0) {
      await getPool().query("DELETE FROM gl_budgets WHERE company_id = $1 AND account_code = $2 AND month = $3", [companyId, code, `${months[i]}-01`]);
    } else {
      await getPool().query(
        `INSERT INTO gl_budgets (company_id, account_code, month, amount) VALUES ($1, $2, $3, $4)
         ON CONFLICT (company_id, account_code, month) DO UPDATE SET amount = EXCLUDED.amount`,
        [companyId, code, `${months[i]}-01`, amount]
      );
    }
  }
}

/** Fills every account that has no budget yet for the year with its suggestion. Returns how many were filled. */
export async function applySuggestedBudgets(start: string): Promise<number> {
  const { rows } = await budgetYear(start);
  let filled = 0;
  for (const r of rows) {
    if (r.budget.some((b) => b !== 0) || r.suggestion.amounts.every((a) => a === 0)) continue;
    await setBudget(start, r.code, r.suggestion.amounts);
    filled++;
  }
  return filled;
}

// ---------------------------------------------------------------------------------------------
// Custom dashboard

export const WIDGETS = {
  health: "Financial health score",
  kpis: "Key ratios",
  cashForecast: "Cash flow forecast",
  incomeCosts: "Income and costs by month",
  topCosts: "Where the money goes",
  receivables: "Money owed to you",
  payables: "Money you owe",
  budget: "Budget this month",
  vat: "Next VAT return",
  bank: "Bank",
} as const;

export type WidgetKey = keyof typeof WIDGETS;
export const DEFAULT_WIDGETS: WidgetKey[] = ["health", "cashForecast", "incomeCosts", "kpis", "receivables", "payables", "topCosts", "budget", "vat", "bank"];

export async function getDashboardLayout(): Promise<WidgetKey[]> {
  await ready();
  const { userId } = await getSession();
  const { rows } = await getPool().query("SELECT widgets FROM dashboard_layouts WHERE company_id = $1 AND user_id = $2", [await currentCompanyId(), userId]);
  const saved = rows[0]?.widgets as string[] | undefined;
  return saved ? (saved.filter((w) => w in WIDGETS) as WidgetKey[]) : DEFAULT_WIDGETS;
}

export async function saveDashboardLayout(widgets: string[]): Promise<void> {
  await ready();
  if (!Array.isArray(widgets) || widgets.some((w) => !(w in WIDGETS))) throw new InsightsError("Unknown dashboard widget.");
  const unique = [...new Set(widgets)];
  const { userId } = await getSession();
  await getPool().query(
    `INSERT INTO dashboard_layouts (company_id, user_id, widgets, updated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (company_id, user_id) DO UPDATE SET widgets = EXCLUDED.widgets, updated_at = now()`,
    [await currentCompanyId(), userId, JSON.stringify(unique)]
  );
}
