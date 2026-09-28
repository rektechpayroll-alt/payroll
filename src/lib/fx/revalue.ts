import { getPool, ready } from "@/lib/db";
import { postJournal } from "@/lib/gl";
import { addDays } from "@/lib/insights/forecast";
import { ledgerDate } from "@/lib/ledger/posting";
import { currentCompanyId } from "@/lib/tenant";
import { FxError, gbpRate } from "./rates";

/**
 * Unrealised exchange gains and losses: what open foreign-currency invoices and bills are worth
 * in pounds at a date, against what they were booked at. Posting it adjusts debtors and
 * creditors at the date and reverses it the next day, so the realised gain or loss on payment
 * is still measured from the booked amount.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = /^\d{4}-\d{2}-\d{2}$/;

export type OpenForeign = {
  kind: "invoice" | "bill";
  id: string;
  reference: string;
  party: string;
  currency: string;
  original: number;
  booked: number;
  rate: number;
  current: number;
  /** Positive is a gain (a receivable worth more, or a payable costing less). */
  difference: number;
};

export async function openForeignBalances(asAt: string): Promise<OpenForeign[]> {
  await ready();
  if (!iso.test(asAt)) throw new FxError("Choose a date.");
  const companyId = await currentCompanyId();
  const pool = getPool();
  // Open at the date: still open now, or paid only after it.
  const [{ rows: invoices }, { rows: bills }] = await Promise.all([
    pool.query(
      `SELECT i.*, (SELECT t.txn_date FROM bank_transactions t WHERE t.matched_invoice_id = i.id AND t.company_id = i.company_id ORDER BY t.sort_order DESC LIMIT 1) AS paid_on
       FROM invoices i WHERE i.company_id = $1 AND i.currency <> 'GBP' AND i.original_total IS NOT NULL AND i.status IN ('sent', 'paid')`,
      [companyId]
    ),
    pool.query(
      `SELECT b.*, (SELECT t.txn_date FROM bank_transactions t WHERE t.matched_bill_id = b.id AND t.company_id = b.company_id ORDER BY t.sort_order DESC LIMIT 1) AS paid_on
       FROM bills b WHERE b.company_id = $1 AND b.currency <> 'GBP' AND b.original_total IS NOT NULL AND b.status IN ('unpaid', 'paid')`,
      [companyId]
    ),
  ]);
  const openAt = (issued: string, paid: boolean, paidOn: string | null) => ledgerDate(issued) <= asAt && (!paid || (paidOn !== null && ledgerDate(paidOn) > asAt));

  const out: OpenForeign[] = [];
  for (const i of invoices) {
    if (!openAt(i.issue_date, i.status === "paid", i.paid_on)) continue;
    const { rate } = await gbpRate(i.currency, asAt);
    const current = round2(i.original_total * rate);
    out.push({ kind: "invoice", id: i.id, reference: i.invoice_number, party: i.customer_name, currency: i.currency, original: i.original_total, booked: i.total, rate, current, difference: round2(current - i.total) });
  }
  for (const b of bills) {
    if (!openAt(b.bill_date, b.status === "paid", b.paid_on)) continue;
    const { rate } = await gbpRate(b.currency, asAt);
    const current = round2(b.original_total * rate);
    out.push({ kind: "bill", id: b.id, reference: b.bill_reference, party: b.supplier_name, currency: b.currency, original: b.original_total, booked: b.total, rate, current, difference: round2(b.total - current) });
  }
  return out;
}

/** Posts the revaluation at `asAt` and its reversal the next day. Returns the net gain (negative for a loss). */
export async function postRevaluation(asAt: string): Promise<number> {
  if (!iso.test(asAt)) throw new FxError("Choose a date.");
  if (asAt > new Date().toISOString().slice(0, 10)) throw new FxError("You can only revalue up to today.");
  const companyId = await currentCompanyId();
  const pool = getPool();
  const { rowCount } = await pool.query("SELECT 1 FROM gl_journals WHERE company_id = $1 AND source_type = 'fx_revaluation' AND source_id = $2", [companyId, asAt]);
  if (rowCount) throw new FxError(`Foreign balances are already revalued at ${asAt}.`);

  const items = await openForeignBalances(asAt);
  const debtors = round2(items.filter((i) => i.kind === "invoice").reduce((s, i) => s + i.difference, 0));
  const creditors = round2(items.filter((i) => i.kind === "bill").reduce((s, i) => s + i.difference, 0));
  const net = round2(debtors + creditors);
  if (!debtors && !creditors) throw new FxError("Nothing to revalue — no open foreign-currency balances have moved.");

  const side = (code: string, gain: number, label: string) => (gain ? [{ accountCode: code, description: label, ...(gain > 0 ? { debit: gain } : { credit: -gain }) }] : []);
  const lines = [
    ...side("1100", debtors, "Foreign-currency invoices revalued"),
    ...side("2100", creditors, "Foreign-currency bills revalued"),
    ...(net ? [{ accountCode: "7950", description: `Unrealised exchange ${net > 0 ? "gain" : "loss"}`, ...(net > 0 ? { credit: net } : { debit: -net }) }] : []),
  ];
  await postJournal(pool, { companyId, date: asAt, narration: `Unrealised exchange gains and losses at ${asAt}`, sourceType: "fx_revaluation", sourceId: asAt, lines });
  await postJournal(pool, {
    companyId,
    date: addDays(asAt, 1),
    narration: `Reversal of exchange revaluation at ${asAt}`,
    sourceType: "fx_revaluation_reversal",
    sourceId: asAt,
    lines: lines.map((l) => ({ accountCode: l.accountCode, description: `Reversal — ${l.description}`, debit: "credit" in l ? l.credit : undefined, credit: "debit" in l ? l.debit : undefined })),
  });
  return net;
}

export type FxSummary = {
  realisedGains: number;
  realisedLosses: number;
  revaluations: Array<{ date: string; net: number }>;
};

/** Realised gains and losses posted on payments since `from`, and every revaluation. */
export async function fxSummary(from: string): Promise<FxSummary> {
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  const [{ rows: realised }, { rows: revals }] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(l.credit), 0)::float8 AS gains, COALESCE(SUM(l.debit), 0)::float8 AS losses
       FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
       WHERE j.company_id = $1 AND l.account_code = '7950' AND j.source_type IN ('invoice_payment', 'bill_payment')
         AND j.reversed_by IS NULL AND j.reverses IS NULL AND j.journal_date >= $2`,
      [companyId, from]
    ),
    pool.query(
      `SELECT j.source_id AS date, COALESCE(SUM(l.credit - l.debit), 0)::float8 AS net
       FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
       WHERE j.company_id = $1 AND j.source_type = 'fx_revaluation' AND l.account_code = '7950'
       GROUP BY j.source_id ORDER BY j.source_id DESC`,
      [companyId]
    ),
  ]);
  return {
    realisedGains: round2(realised[0].gains),
    realisedLosses: round2(realised[0].losses),
    revaluations: revals.map((r) => ({ date: r.date, net: round2(r.net) })),
  };
}
