import { randomUUID } from "node:crypto";
import { getPool, ready } from "@/lib/db";
import { postJournal, reverseJournal, type AccountType } from "@/lib/gl";
import { currentCompanyId } from "@/lib/tenant";
import { ledgerDate } from "./posting";

/** Financial statements and ledger actions, all read from — or written to — the general ledger. */

export class LedgerError extends Error {}

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = /^\d{4}-\d{2}-\d{2}$/;

export type AccountBalance = { code: string; name: string; type: AccountType; debit: number; credit: number; balance: number };

/** Net movement per account between two dates (inclusive). `balance` is on the account's natural side. */
export async function accountBalances(from: string | null, to: string): Promise<AccountBalance[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT a.code, a.name, a.type, COALESCE(t.debit, 0)::float8 AS debit, COALESCE(t.credit, 0)::float8 AS credit
     FROM gl_accounts a
     LEFT JOIN (
       SELECT l.account_code, SUM(l.debit) AS debit, SUM(l.credit) AS credit
       FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
       WHERE j.company_id = $1 AND j.journal_date <= $3 AND ($2::date IS NULL OR j.journal_date >= $2)
       GROUP BY l.account_code
     ) t ON t.account_code = a.code
     WHERE a.company_id = $1
     ORDER BY a.code`,
    [await currentCompanyId(), from, to]
  );
  return rows.map((r) => {
    const natural = r.type === "asset" || r.type === "expense" ? r.debit - r.credit : r.credit - r.debit;
    return { ...r, debit: round2(r.debit), credit: round2(r.credit), balance: round2(natural) };
  });
}

export type ProfitAndLoss = {
  from: string;
  to: string;
  income: AccountBalance[];
  costOfSales: AccountBalance[];
  expenses: AccountBalance[];
  totalIncome: number;
  grossProfit: number;
  totalExpenses: number;
  netProfit: number;
};

export async function profitAndLoss(from: string, to: string): Promise<ProfitAndLoss> {
  if (!iso.test(from) || !iso.test(to) || to < from) throw new LedgerError("Choose a valid date range.");
  const all = (await accountBalances(from, to)).filter((a) => a.balance !== 0);
  const income = all.filter((a) => a.type === "income");
  const costOfSales = all.filter((a) => a.type === "expense" && a.code.startsWith("5"));
  const expenses = all.filter((a) => a.type === "expense" && !a.code.startsWith("5"));
  const totalIncome = round2(income.reduce((s, a) => s + a.balance, 0));
  const grossProfit = round2(totalIncome - costOfSales.reduce((s, a) => s + a.balance, 0));
  const totalExpenses = round2(expenses.reduce((s, a) => s + a.balance, 0));
  return { from, to, income, costOfSales, expenses, totalIncome, grossProfit, totalExpenses, netProfit: round2(grossProfit - totalExpenses) };
}

export type BalanceSheet = {
  asAt: string;
  assets: AccountBalance[];
  liabilities: AccountBalance[];
  equity: AccountBalance[];
  profitToDate: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
};

export async function balanceSheet(asAt: string): Promise<BalanceSheet> {
  if (!iso.test(asAt)) throw new LedgerError("Choose a valid date.");
  const all = await accountBalances(null, asAt);
  const pick = (t: AccountType) => all.filter((a) => a.type === t && a.balance !== 0);
  const profitToDate = round2(
    all.filter((a) => a.type === "income").reduce((s, a) => s + a.balance, 0) - all.filter((a) => a.type === "expense").reduce((s, a) => s + a.balance, 0)
  );
  const assets = pick("asset");
  const liabilities = pick("liability");
  const equity = pick("equity");
  const totalAssets = round2(assets.reduce((s, a) => s + a.balance, 0));
  const totalLiabilities = round2(liabilities.reduce((s, a) => s + a.balance, 0));
  const totalEquity = round2(equity.reduce((s, a) => s + a.balance, 0) + profitToDate);
  return {
    asAt,
    assets,
    liabilities,
    equity,
    profitToDate,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: Math.abs(totalAssets - totalLiabilities - totalEquity) < 0.005,
  };
}

export type AgedRow = { id: string; name: string; reference: string; dueDate: string; amount: number; daysOverdue: number; bucket: AgedBucket };
export type AgedBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";
export const AGED_BUCKETS: AgedBucket[] = ["current", "1-30", "31-60", "61-90", "90+"];

function bucketFor(days: number): AgedBucket {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

/** Outstanding sales invoices (receivables) or unpaid bills (payables), by how overdue they are. */
export async function aged(kind: "receivables" | "payables", asAt: string): Promise<{ rows: AgedRow[]; totals: Record<AgedBucket, number>; total: number }> {
  await ready();
  const companyId = await currentCompanyId();
  const { rows } =
    kind === "receivables"
      ? await getPool().query(
          "SELECT id, customer_name AS name, invoice_number AS reference, due_date, total FROM invoices WHERE company_id = $1 AND status = 'sent'",
          [companyId]
        )
      : await getPool().query(
          "SELECT id, supplier_name AS name, bill_reference AS reference, due_date, total FROM bills WHERE company_id = $1 AND status = 'unpaid'",
          [companyId]
        );
  const at = Date.parse(`${asAt}T00:00:00Z`);
  const out: AgedRow[] = rows.map((r) => {
    const due = ledgerDate(r.due_date);
    const daysOverdue = Math.floor((at - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
    return { id: r.id, name: r.name, reference: r.reference, dueDate: due, amount: round2(r.total), daysOverdue, bucket: bucketFor(daysOverdue) };
  });
  out.sort((a, b) => b.daysOverdue - a.daysOverdue);
  const totals = Object.fromEntries(AGED_BUCKETS.map((b) => [b, round2(out.filter((r) => r.bucket === b).reduce((s, r) => s + r.amount, 0))])) as Record<AgedBucket, number>;
  return { rows: out, totals, total: round2(out.reduce((s, r) => s + r.amount, 0)) };
}

export type ManualLine = { accountCode: string; description: string; debit: number; credit: number };

/** A journal entered by hand — opening balances, accruals, corrections, HMRC payments. Must balance. */
export async function createManualJournal(input: { date: string; narration: string; lines: ManualLine[] }): Promise<string> {
  await ready();
  const companyId = await currentCompanyId();
  const narration = input.narration.trim();
  if (!iso.test(input.date)) throw new LedgerError("Enter the journal date.");
  if (!narration) throw new LedgerError("Add a narration so you know what this journal is for later.");
  const lines = input.lines
    .map((l) => ({ ...l, debit: round2(Number(l.debit) || 0), credit: round2(Number(l.credit) || 0), description: l.description?.trim() || narration }))
    .filter((l) => l.debit || l.credit);
  if (lines.length < 2) throw new LedgerError("A journal needs at least two lines.");
  if (lines.some((l) => l.debit < 0 || l.credit < 0 || (l.debit && l.credit))) throw new LedgerError("Each line is either a debit or a credit, and positive.");
  const dr = round2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = round2(lines.reduce((s, l) => s + l.credit, 0));
  if (dr !== cr) throw new LedgerError(`Debits (£${dr.toFixed(2)}) and credits (£${cr.toFixed(2)}) must be equal.`);
  const { rows } = await getPool().query("SELECT code FROM gl_accounts WHERE company_id = $1", [companyId]);
  const codes = new Set(rows.map((r) => r.code));
  const unknown = lines.find((l) => !codes.has(l.accountCode));
  if (unknown) throw new LedgerError(`Account ${unknown.accountCode} isn't in your chart of accounts.`);
  const { journalId } = await postJournal(getPool(), {
    companyId,
    date: input.date,
    narration,
    sourceType: "manual",
    sourceId: randomUUID(),
    lines: lines.map((l) => ({ accountCode: l.accountCode, description: l.description, debit: l.debit, credit: l.credit })),
  });
  return journalId;
}

/** Reverses a manual journal (automatic journals are corrected by changing their source document). */
export async function reverseManualJournal(journalId: string): Promise<void> {
  await ready();
  const companyId = await currentCompanyId();
  const { rows } = await getPool().query("SELECT source_type FROM gl_journals WHERE id = $1 AND company_id = $2", [journalId, companyId]);
  if (!rows[0]) throw new LedgerError("Journal not found.");
  if (rows[0].source_type !== "manual") throw new LedgerError("Only manual journals can be reversed here — change the invoice, bill or claim instead.");
  const reversal = await reverseJournal(getPool(), companyId, journalId, new Date().toISOString().slice(0, 10), "reversed by user");
  if (!reversal) throw new LedgerError("That journal has already been reversed.");
}

/** Records that an approved run's net pay has left the bank: clears Net wages payable. */
export async function recordWagesPaid(runId: string): Promise<void> {
  await ready();
  const companyId = await currentCompanyId();
  const { rows } = await getPool().query(
    `SELECT id, status, source, net_pay, period_label, to_char(pay_date, 'YYYY-MM-DD') AS pay_date FROM payroll_runs WHERE id = $1 AND company_id = $2`,
    [runId, companyId]
  );
  const run = rows[0];
  if (!run) throw new LedgerError("Pay run not found.");
  if (run.source !== "engine" || !run.status.startsWith("approved")) throw new LedgerError("Approve the pay run first.");
  await postJournal(getPool(), {
    companyId,
    date: run.pay_date,
    narration: `Wages paid — ${run.period_label}`,
    sourceType: "payroll_payment",
    sourceId: runId,
    lines: [
      { accountCode: "2220", description: "Net wages", debit: run.net_pay },
      { accountCode: "1200", description: "Net wages", credit: run.net_pay },
    ],
  });
  await getPool().query("UPDATE payroll_runs SET wages_paid_at = $2 WHERE id = $1", [runId, run.pay_date]);
}

export async function getChartOfAccounts() {
  const to = new Date().toISOString().slice(0, 10);
  return accountBalances(null, to);
}
