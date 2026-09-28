import type { Pool } from "pg";
import { expenseAccountFor, journalHash, postJournal, reverseJournal, type JournalLineInput } from "@/lib/gl";
import { vatFromGross } from "@/lib/vat/calc";

/**
 * Keeps the general ledger in step with every source document. For each document we work
 * out the journals it *should* have given its current state, compare with the journals in
 * force, then post what's missing and reverse what's no longer true (e.g. an unmatched
 * payment or a voided invoice). Re-running is always safe, so the same code posts live
 * changes and backfills existing data.
 */

export type DocType = "invoice" | "bill" | "expense_claim" | "mileage_claim" | "fixed_asset" | "bank_transaction";

type Desired = { sourceType: string; sourceId: string; date: string; narration: string; lines: JournalLineInput[] };

const A = {
  fixedAssets: "0010",
  depreciationProvision: "0011",
  debtors: "1100",
  bank: "1200",
  creditors: "2100",
  vat: "2200",
  expensesPayable: "2250",
  capital: "3000",
  sales: "4000",
  depreciation: "8000",
  travel: "7400",
} as const;

/** Source types each document family owns — anything in force for the document outside `desired` gets reversed. */
const FAMILY: Record<DocType, string[]> = {
  invoice: ["invoice", "invoice_payment"],
  bill: ["bill", "bill_payment"],
  expense_claim: ["expense_claim", "expense_claim_payment"],
  mileage_claim: ["mileage_claim", "mileage_claim_payment"],
  fixed_asset: ["fixed_asset"],
  bank_transaction: ["bank_transaction"],
};

const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dates on older records are free text ("5 Sep 2026"); journals need YYYY-MM-DD. */
export function ledgerDate(s: string | null | undefined, fallback = today()): string {
  if (!s) return fallback;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(`${s} 12:00 UTC`);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString().slice(0, 10);
}

async function desiredFor(pool: Pool, companyId: string, type: DocType, id: string): Promise<Desired[]> {
  const out: Desired[] = [];
  if (type === "invoice") {
    const { rows } = await pool.query("SELECT * FROM invoices WHERE id = $1 AND company_id = $2", [id, companyId]);
    const inv = rows[0];
    if (!inv) return out;
    // Drafts aren't in the books; sent and paid invoices are sales; void ones never happened.
    if (inv.status === "sent" || inv.status === "paid") {
      out.push({
        sourceType: "invoice",
        sourceId: id,
        date: ledgerDate(inv.issue_date),
        narration: `Invoice ${inv.invoice_number} — ${inv.customer_name}`,
        lines: [
          { accountCode: A.debtors, description: inv.customer_name, debit: inv.total },
          { accountCode: A.sales, description: `Sales${inv.currency !== "GBP" ? ` (${inv.currency} at ${inv.fx_rate})` : ""}`, credit: inv.subtotal },
          { accountCode: A.vat, description: `Output VAT at ${inv.vat_rate}%`, credit: inv.vat_amount },
        ],
      });
    }
    if (inv.status === "paid") {
      const { rows: txn } = await pool.query(
        "SELECT txn_date FROM bank_transactions WHERE matched_invoice_id = $1 AND company_id = $2 ORDER BY sort_order DESC LIMIT 1",
        [id, companyId]
      );
      out.push({
        sourceType: "invoice_payment",
        sourceId: id,
        date: ledgerDate(txn[0]?.txn_date, ledgerDate(inv.due_date)),
        narration: `Payment received — ${inv.invoice_number}`,
        lines: [
          { accountCode: A.bank, description: inv.customer_name, debit: inv.total },
          { accountCode: A.debtors, description: inv.invoice_number, credit: inv.total },
        ],
      });
    }
  }

  if (type === "bill") {
    const { rows } = await pool.query("SELECT * FROM bills WHERE id = $1 AND company_id = $2", [id, companyId]);
    const bill = rows[0];
    if (!bill || bill.status === "void") return out;
    out.push({
      sourceType: "bill",
      sourceId: id,
      date: ledgerDate(bill.bill_date),
      narration: `Bill ${bill.bill_reference} — ${bill.supplier_name}`,
      lines: [
        { accountCode: expenseAccountFor(bill.category), description: bill.category ?? bill.supplier_name, debit: round2(bill.total - (bill.vat_amount ?? 0)) },
        ...(bill.vat_amount ? [{ accountCode: A.vat, description: `Input VAT at ${bill.vat_rate}%`, debit: bill.vat_amount }] : []),
        { accountCode: A.creditors, description: bill.supplier_name, credit: bill.total },
      ],
    });
    if (bill.status === "paid") {
      const { rows: txn } = await pool.query(
        "SELECT txn_date FROM bank_transactions WHERE matched_bill_id = $1 AND company_id = $2 ORDER BY sort_order DESC LIMIT 1",
        [id, companyId]
      );
      out.push({
        sourceType: "bill_payment",
        sourceId: id,
        date: ledgerDate(txn[0]?.txn_date, ledgerDate(bill.due_date)),
        narration: `Paid ${bill.supplier_name} — ${bill.bill_reference}`,
        lines: [
          { accountCode: A.creditors, description: bill.bill_reference, debit: bill.total },
          { accountCode: A.bank, description: bill.supplier_name, credit: bill.total },
        ],
      });
    }
  }

  if (type === "expense_claim" || type === "mileage_claim") {
    const table = type === "expense_claim" ? "expense_claims" : "mileage_claims";
    const { rows } = await pool.query(
      `SELECT c.*, e.name AS employee_name FROM ${table} c LEFT JOIN employees e ON e.id = c.employee_id WHERE c.id = $1 AND c.company_id = $2`,
      [id, companyId]
    );
    const c = rows[0];
    if (!c) return out;
    const date = ledgerDate(type === "expense_claim" ? c.expense_date : c.trip_date);
    const what = type === "expense_claim" ? `${c.description}` : `Mileage ${c.from_location} → ${c.to_location} (${c.miles} mi)`;
    const account = type === "expense_claim" ? expenseAccountFor(c.category) : A.travel;
    if (c.status === "approved" || c.status === "reimbursed") {
      out.push({
        sourceType: type,
        sourceId: id,
        date,
        narration: `${type === "expense_claim" ? "Expense claim" : "Mileage claim"} — ${c.employee_name ?? "employee"}: ${what}`,
        lines: [
          { accountCode: account, description: what, debit: round2(c.amount - (c.vat_amount ?? 0)) },
          ...(c.vat_amount ? [{ accountCode: A.vat, description: "Input VAT", debit: c.vat_amount }] : []),
          { accountCode: A.expensesPayable, description: c.employee_name ?? "Employee", credit: c.amount },
        ],
      });
    }
    if (c.status === "reimbursed") {
      out.push({
        sourceType: `${type}_payment`,
        sourceId: id,
        date,
        narration: `Reimbursed ${c.employee_name ?? "employee"}`,
        lines: [
          { accountCode: A.expensesPayable, description: c.employee_name ?? "Employee", debit: c.amount },
          { accountCode: A.bank, description: what, credit: c.amount },
        ],
      });
    }
  }

  if (type === "bank_transaction") {
    // A statement line reconciled straight to an account (bank fees, a supplier with no bill, sundry income).
    const { rows } = await pool.query("SELECT * FROM bank_transactions WHERE id = $1 AND company_id = $2", [id, companyId]);
    const t = rows[0];
    if (!t || t.status !== "matched" || !t.account_code) return out;
    const vat = t.vat_rate ? vatFromGross(Math.round(t.amount * 100), t.vat_rate) / 100 : 0;
    const net = round2(t.amount - vat);
    const vatLine = vat ? [{ accountCode: A.vat, description: `VAT at ${t.vat_rate}%`, ...(t.direction === "credit" ? { credit: vat } : { debit: vat }) }] : [];
    out.push({
      sourceType: "bank_transaction",
      sourceId: id,
      date: ledgerDate(t.txn_date),
      narration: `Bank: ${t.description}`,
      lines:
        t.direction === "credit"
          ? [{ accountCode: A.bank, description: t.description, debit: t.amount }, { accountCode: t.account_code, description: t.description, credit: net }, ...vatLine]
          : [{ accountCode: t.account_code, description: t.description, debit: net }, ...vatLine, { accountCode: A.bank, description: t.description, credit: t.amount }],
    });
  }

  if (type === "fixed_asset") {
    const { rows } = await pool.query("SELECT * FROM fixed_assets WHERE id = $1 AND company_id = $2", [id, companyId]);
    const a = rows[0];
    if (!a) return out;
    out.push({
      sourceType: "fixed_asset",
      sourceId: id,
      date: ledgerDate(a.purchase_date),
      narration: `Asset purchased — ${a.name}`,
      lines: [
        { accountCode: A.fixedAssets, description: a.name, debit: a.purchase_cost },
        { accountCode: A.bank, description: a.name, credit: a.purchase_cost },
      ],
    });
  }
  return out;
}

async function activeJournals(pool: Pool, companyId: string, sourceTypes: string[], sourceId: string) {
  const { rows } = await pool.query(
    `SELECT id, source_type, content_hash FROM gl_journals
     WHERE company_id = $1 AND source_type = ANY($2) AND source_id = $3 AND reversed_by IS NULL AND reverses IS NULL`,
    [companyId, sourceTypes, sourceId]
  );
  return rows as Array<{ id: string; source_type: string; content_hash: string | null }>;
}

/** Brings one source's journals into line with `desired`. */
async function reconcile(pool: Pool, companyId: string, family: string[], sourceId: string, desired: Desired[]) {
  const active = await activeJournals(pool, companyId, family, sourceId);
  for (const j of active) {
    const want = desired.find((d) => d.sourceType === j.source_type);
    if (!want) {
      await reverseJournal(pool, companyId, j.id, today(), "no longer applies");
    } else if (j.content_hash && j.content_hash !== journalHash(want.date, want.lines)) {
      await reverseJournal(pool, companyId, j.id, today(), "source document changed");
    }
  }
  for (const d of desired) {
    await postJournal(pool, { companyId, date: d.date, narration: d.narration, sourceType: d.sourceType, sourceId: d.sourceId, lines: d.lines });
  }
}

export async function syncDocument(pool: Pool, companyId: string, type: DocType, id: string): Promise<void> {
  await reconcile(pool, companyId, FAMILY[type], id, await desiredFor(pool, companyId, type, id));
}

/** Straight-line depreciation, one journal per month for the whole asset register, up to last month-end. */
export async function syncDepreciation(pool: Pool, companyId: string, asAt = today()): Promise<void> {
  const { rows: assets } = await pool.query("SELECT * FROM fixed_assets WHERE company_id = $1", [companyId]);
  // Charge up to the end of the previous month.
  const lastMonth = new Date(Date.UTC(Number(asAt.slice(0, 4)), Number(asAt.slice(5, 7)) - 1, 0));
  const byMonth = new Map<string, Array<{ name: string; amount: number }>>();
  for (const a of assets) {
    const start = ledgerDate(a.purchase_date);
    const months = Math.max(0, Math.round(Number(a.useful_life_years) * 12));
    if (!months || !(a.purchase_cost > 0)) continue;
    const monthly = Math.round((a.purchase_cost * 100) / months) / 100;
    let charged = 0;
    // First charge is for the month of purchase, posted at that month's end.
    for (let i = 0; i < months; i++) {
      const end = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) + i, 0));
      if (end > lastMonth) break;
      const amount = i === months - 1 ? Math.round((a.purchase_cost - charged) * 100) / 100 : monthly;
      charged = Math.round((charged + amount) * 100) / 100;
      const key = end.toISOString().slice(0, 10);
      byMonth.set(key, [...(byMonth.get(key) ?? []), { name: a.name, amount }]);
    }
  }
  const desired: Desired[] = [...byMonth.entries()].map(([monthEnd, items]) => {
    const total = Math.round(items.reduce((s, x) => s + x.amount, 0) * 100) / 100;
    return {
      sourceType: "depreciation",
      sourceId: monthEnd,
      date: monthEnd,
      narration: `Depreciation — ${monthEnd.slice(0, 7)}`,
      lines: [
        { accountCode: A.depreciation, description: `${items.length} asset${items.length === 1 ? "" : "s"}`, debit: total },
        { accountCode: A.depreciationProvision, description: "Straight-line depreciation", credit: total },
      ],
    };
  });
  // Months that should no longer carry a charge (e.g. an asset was removed) are reversed.
  const { rows: active } = await pool.query(
    "SELECT source_id FROM gl_journals WHERE company_id = $1 AND source_type = 'depreciation' AND reversed_by IS NULL AND reverses IS NULL",
    [companyId]
  );
  const months = new Set([...active.map((r) => r.source_id as string), ...desired.map((d) => d.sourceId)]);
  for (const m of months) await reconcile(pool, companyId, ["depreciation"], m, desired.filter((d) => d.sourceId === m));
}

/** Current ledger posting rules version — bump to re-run the backfill for every business. */
export const LEDGER_VERSION = 1;

/** Posts everything a business's documents imply. Idempotent. */
export async function syncCompanyLedger(pool: Pool, companyId: string): Promise<void> {
  const docs: Array<[DocType, string]> = [
    ["invoice", "invoices"],
    ["bill", "bills"],
    ["expense_claim", "expense_claims"],
    ["mileage_claim", "mileage_claims"],
    ["fixed_asset", "fixed_assets"],
  ];
  for (const [type, table] of docs) {
    const { rows } = await pool.query(`SELECT id FROM ${table} WHERE company_id = $1`, [companyId]);
    for (const r of rows) await syncDocument(pool, companyId, type, r.id);
  }
  await syncDepreciation(pool, companyId);
}

/** Opening balance for the bank, against capital — for a business moving its books into Verity. */
export async function postOpeningBankBalance(pool: Pool, companyId: string, date: string, amount: number) {
  if (!amount) return;
  await postJournal(pool, {
    companyId,
    date,
    narration: "Opening bank balance",
    sourceType: "opening_balance",
    sourceId: "bank",
    lines:
      amount > 0
        ? [
            { accountCode: A.bank, description: "Opening balance", debit: amount },
            { accountCode: A.capital, description: "Opening balance", credit: amount },
          ]
        : [
            { accountCode: A.capital, description: "Opening balance", debit: -amount },
            { accountCode: A.bank, description: "Opening balance", credit: -amount },
          ],
  });
}
