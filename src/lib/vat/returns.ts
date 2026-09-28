import { randomUUID } from "node:crypto";
import { getPool, ready } from "@/lib/db";
import { ledgerDate } from "@/lib/ledger/posting";
import { currentCompanyId, getSession } from "@/lib/tenant";
import { vatBoxes, vatFromGross, vatQuarters, type VatBoxes, type VatItem } from "./calc";

/** VAT returns built from Verity's records, plus the period lock that follows filing. */

export class VatError extends Error {}

const toPence = (pounds: number) => Math.round(pounds * 100);

export type VatSettings = {
  vat_registered: boolean;
  vat_number: string | null;
  vat_scheme: "accrual" | "cash";
  vat_stagger: 1 | 2 | 3;
  vat_locked_until: string | null;
};

export async function getVatSettings(): Promise<VatSettings> {
  await ready();
  const { rows } = await getPool().query(
    "SELECT vat_registered, vat_number, vat_scheme, vat_stagger, to_char(vat_locked_until, 'YYYY-MM-DD') AS vat_locked_until FROM companies WHERE id = $1",
    [await currentCompanyId()]
  );
  return rows[0] as VatSettings;
}

export async function updateVatSettings(input: { registered: boolean; vatNumber: string | null; scheme: "accrual" | "cash"; stagger: 1 | 2 | 3 }) {
  await ready();
  const vrn = input.vatNumber?.replace(/\s|^GB/gi, "") || null;
  if (input.registered && !(vrn && /^\d{9}$/.test(vrn))) throw new VatError("A UK VAT registration number is 9 digits (e.g. GB123456789).");
  if (!["accrual", "cash"].includes(input.scheme)) throw new VatError("Choose standard or cash accounting.");
  if (![1, 2, 3].includes(input.stagger)) throw new VatError("Choose when your VAT quarters end.");
  await getPool().query("UPDATE companies SET vat_registered = $1, vat_number = $2, vat_scheme = $3, vat_stagger = $4 WHERE id = $5", [
    input.registered,
    vrn,
    input.scheme,
    input.stagger,
    await currentCompanyId(),
  ]);
}

/**
 * Throws if `date` falls in a VAT period that's already been filed. Changing records there
 * would make the filed return wrong; corrections belong in the current period instead.
 */
export async function assertVatPeriodOpen(companyId: string, date: string, what: string): Promise<void> {
  const { rows } = await getPool().query("SELECT vat_registered, to_char(vat_locked_until, 'YYYY-MM-DD') AS locked FROM companies WHERE id = $1", [companyId]);
  const locked = rows[0]?.vat_registered ? rows[0].locked : null;
  if (locked && ledgerDate(date) <= locked) {
    throw new VatError(`${what} is dated ${ledgerDate(date)}, in a VAT period already filed (up to ${locked}). Date it in the current period instead.`);
  }
}

export type VatSource = { kind: VatItem["kind"]; type: string; reference: string; date: string; net: number; vat: number };

/** Every sale and purchase that belongs in a period's return, with its net and VAT (pence). */
export async function vatSources(start: string, end: string, scheme: "accrual" | "cash"): Promise<VatSource[]> {
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  const inPeriod = (d: string) => d >= start && d <= end;
  const out: VatSource[] = [];

  // Sales invoices: by issue date (standard accounting) or payment date (cash accounting).
  const { rows: invoices } = await pool.query(
    `SELECT i.*, (SELECT t.txn_date FROM bank_transactions t WHERE t.matched_invoice_id = i.id AND t.company_id = i.company_id ORDER BY t.sort_order DESC LIMIT 1) AS paid_on
     FROM invoices i WHERE i.company_id = $1 AND i.status IN ('sent', 'paid')`,
    [companyId]
  );
  for (const i of invoices) {
    const date = scheme === "accrual" ? ledgerDate(i.issue_date) : i.status === "paid" ? ledgerDate(i.paid_on, ledgerDate(i.due_date)) : null;
    if (date && inPeriod(date)) out.push({ kind: "sale", type: "Invoice", reference: `${i.invoice_number} — ${i.customer_name}`, date, net: toPence(i.subtotal), vat: toPence(i.vat_amount) });
  }

  const { rows: bills } = await pool.query(
    `SELECT b.*, (SELECT t.txn_date FROM bank_transactions t WHERE t.matched_bill_id = b.id AND t.company_id = b.company_id ORDER BY t.sort_order DESC LIMIT 1) AS paid_on
     FROM bills b WHERE b.company_id = $1 AND b.status <> 'void'`,
    [companyId]
  );
  for (const b of bills) {
    const date = scheme === "accrual" ? ledgerDate(b.bill_date) : b.status === "paid" ? ledgerDate(b.paid_on, ledgerDate(b.due_date)) : null;
    if (date && inPeriod(date)) out.push({ kind: "purchase", type: "Bill", reference: `${b.bill_reference} — ${b.supplier_name}`, date, net: toPence(b.total - b.vat_amount), vat: toPence(b.vat_amount) });
  }

  const { rows: claims } = await pool.query(
    "SELECT c.*, e.name AS employee_name FROM expense_claims c LEFT JOIN employees e ON e.id = c.employee_id WHERE c.company_id = $1 AND c.status IN ('approved', 'reimbursed')",
    [companyId]
  );
  for (const c of claims) {
    // Cash accounting counts a claim once it's been reimbursed.
    if (scheme === "cash" && c.status !== "reimbursed") continue;
    const date = ledgerDate(c.expense_date);
    if (inPeriod(date)) out.push({ kind: "purchase", type: "Expense claim", reference: `${c.employee_name ?? "Employee"} — ${c.description}`, date, net: toPence(c.amount - c.vat_amount), vat: toPence(c.vat_amount) });
  }

  // Bank lines posted straight to an income or expense account.
  const { rows: lines } = await pool.query(
    `SELECT t.*, a.type AS account_type FROM bank_transactions t JOIN gl_accounts a ON a.company_id = t.company_id AND a.code = t.account_code
     WHERE t.company_id = $1 AND t.status = 'matched' AND t.account_code IS NOT NULL`,
    [companyId]
  );
  for (const t of lines) {
    const date = ledgerDate(t.txn_date);
    if (!inPeriod(date)) continue;
    const gross = toPence(t.amount);
    const vat = vatFromGross(gross, t.vat_rate);
    if (t.direction === "credit" && t.account_type === "income") out.push({ kind: "sale", type: "Bank receipt", reference: t.description, date, net: gross - vat, vat });
    if (t.direction === "debit" && (t.account_type === "expense" || t.account_type === "asset")) out.push({ kind: "purchase", type: "Bank payment", reference: t.description, date, net: gross - vat, vat });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export type VatPeriod = { start: string; end: string; status: "open" | "due" | "finalised" | "submitted"; returnId: string | null; boxes: VatBoxes | null; dueDate: string };

/** The business's VAT quarters from a year ago to the current one, with each one's filing status. */
export async function vatPeriods(today = new Date().toISOString().slice(0, 10)): Promise<VatPeriod[]> {
  const settings = await getVatSettings();
  const year = Number(today.slice(0, 4));
  const all = [...vatQuarters(settings.vat_stagger, year - 1), ...vatQuarters(settings.vat_stagger, year), ...vatQuarters(settings.vat_stagger, year + 1)];
  const { rows } = await getPool().query(
    "SELECT *, to_char(period_start, 'YYYY-MM-DD') AS ps, to_char(period_end, 'YYYY-MM-DD') AS pe FROM vat_returns WHERE company_id = $1",
    [await currentCompanyId()]
  );
  const lastYear = new Date(Date.parse(`${today}T00:00:00Z`) - 400 * 86_400_000).toISOString().slice(0, 10);
  return all
    .filter((q) => q.end >= lastYear && q.start <= today)
    .map((q) => {
      const r = rows.find((x) => x.ps === q.start && x.pe === q.end);
      // Due one calendar month and seven days after the period ends.
      const due = new Date(Date.UTC(Number(q.end.slice(0, 4)), Number(q.end.slice(5, 7)) + 1, 0));
      due.setUTCDate(due.getUTCDate() + 7);
      return {
        ...q,
        status: r ? (r.status === "submitted" ? "submitted" : "finalised") : q.end < today ? "due" : "open",
        returnId: r?.id ?? null,
        boxes: r ? { box1: toPence(r.box1), box2: toPence(r.box2), box3: toPence(r.box3), box4: toPence(r.box4), box5: toPence(r.box5), box6: toPence(r.box6), box7: toPence(r.box7), box8: toPence(r.box8), box9: toPence(r.box9), payable: r.box3 >= r.box4 } : null,
        dueDate: due.toISOString().slice(0, 10),
      } as VatPeriod;
    })
    .reverse();
}

export async function calculateVatReturn(start: string, end: string) {
  const settings = await getVatSettings();
  const sources = await vatSources(start, end, settings.vat_scheme);
  return { boxes: vatBoxes(sources), sources, scheme: settings.vat_scheme };
}

/** Saves the return's figures and locks the period so filed figures can't drift. */
export async function finaliseVatReturn(start: string, end: string): Promise<string> {
  await ready();
  const companyId = await currentCompanyId();
  const settings = await getVatSettings();
  if (!settings.vat_registered) throw new VatError("Turn on VAT registration in VAT settings first.");
  if (end >= new Date().toISOString().slice(0, 10)) throw new VatError("You can only finalise a VAT period once it has ended.");
  const { boxes } = await calculateVatReturn(start, end);
  const id = randomUUID();
  const pounds = (p: number) => p / 100;
  const res = await getPool().query(
    `INSERT INTO vat_returns (id, company_id, period_start, period_end, scheme, box1, box2, box3, box4, box5, box6, box7, box8, box9, finalised_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     ON CONFLICT (company_id, period_start, period_end) DO NOTHING`,
    [id, companyId, start, end, settings.vat_scheme, ...[boxes.box1, boxes.box2, boxes.box3, boxes.box4, boxes.box5, boxes.box6, boxes.box7, boxes.box8, boxes.box9].map(pounds), (await getSession()).email]
  );
  if (!res.rowCount) throw new VatError("This period's return has already been finalised.");
  await getPool().query("UPDATE companies SET vat_locked_until = GREATEST(COALESCE(vat_locked_until, $2::date), $2::date) WHERE id = $1", [companyId, end]);
  return id;
}

export async function getVatReturn(id: string) {
  await ready();
  const { rows } = await getPool().query(
    "SELECT *, to_char(period_start, 'YYYY-MM-DD') AS ps, to_char(period_end, 'YYYY-MM-DD') AS pe FROM vat_returns WHERE id = $1 AND company_id = $2",
    [id, await currentCompanyId()]
  );
  return rows[0] ?? null;
}
