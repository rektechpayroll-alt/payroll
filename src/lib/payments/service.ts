import { randomUUID } from "node:crypto";
import { getPool, ready } from "@/lib/db";
import { ledgerDate } from "@/lib/ledger/posting";
import { paymentsCsv, standard18, type Payee } from "@/lib/payroll/payments";
import { payBill } from "@/lib/queries";
import { currentCompanyId, getSession } from "@/lib/tenant";
import { buildPain001, type Pain001Payment } from "./pain001";
import { accountOk, bicOk, cleanAccount, cleanBic, cleanIban, cleanSortCode, ibanOk, sepaText, sortCodeOk } from "./validate";

/**
 * Paying suppliers: bank details for the business and its suppliers, and payment files made
 * from unpaid bills. A bill in a file waits there until the file is marked paid (which records
 * the payments, ready for the bank statement to confirm) or cancelled, so nothing is paid twice.
 */

export class PaymentError extends Error {}

export type PaymentFormat = "csv" | "bacs18" | "pain001";
export const FORMAT_LABELS: Record<PaymentFormat, string> = {
  csv: "Bank bulk payment CSV (UK, sterling)",
  bacs18: "Bacs Standard 18 (UK, sterling — needs a Bacs service user number)",
  pain001: "ISO 20022 pain.001 XML (SEPA and international)",
};

type BankInput = { accountName: string | null; sortCode: string | null; accountNumber: string | null; iban: string | null; bic: string | null };

function checkBank(b: BankInput) {
  const sortCode = cleanSortCode(b.sortCode);
  const accountNumber = cleanAccount(b.accountNumber);
  const iban = cleanIban(b.iban);
  const bic = cleanBic(b.bic);
  if ((sortCode || accountNumber) && !(sortCodeOk(sortCode) && accountOk(accountNumber))) throw new PaymentError("A UK sort code is 6 digits and an account number 8 digits.");
  if (iban && !ibanOk(iban)) throw new PaymentError("That IBAN doesn't check out — look for a mistyped character.");
  if (bic && !bicOk(bic)) throw new PaymentError("A BIC (SWIFT code) is 8 or 11 characters, e.g. NWBKGB2L.");
  return { accountName: b.accountName?.trim() || null, sortCode: sortCode || null, accountNumber: accountNumber || null, iban: iban || null, bic: bic || null };
}

export type BankDetails = { accountName: string | null; sortCode: string | null; accountNumber: string | null; iban: string | null; bic: string | null; bacsSun: string | null };

export async function getBankDetails(): Promise<BankDetails> {
  await ready();
  const { rows } = await getPool().query("SELECT bank_account_name, bank_sort_code, bank_account_number, iban, bic, bacs_sun FROM companies WHERE id = $1", [await currentCompanyId()]);
  const r = rows[0];
  return { accountName: r.bank_account_name, sortCode: r.bank_sort_code, accountNumber: r.bank_account_number, iban: r.iban, bic: r.bic, bacsSun: r.bacs_sun };
}

export async function updateBankDetails(input: BankInput): Promise<void> {
  await ready();
  const b = checkBank(input);
  await getPool().query("UPDATE companies SET bank_account_name = $2, bank_sort_code = $3, bank_account_number = $4, iban = $5, bic = $6 WHERE id = $1", [
    await currentCompanyId(),
    b.accountName,
    b.sortCode,
    b.accountNumber,
    b.iban,
    b.bic,
  ]);
}

export type SupplierBank = { name: string; accountName: string | null; sortCode: string | null; accountNumber: string | null; iban: string | null; bic: string | null };

/** Every supplier — from contacts and from bills — with whatever bank details are on file. */
export async function listSupplierBanks(): Promise<SupplierBank[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT n.name, c.bank_account_name, c.bank_sort_code, c.bank_account_number, c.iban, c.bic
     FROM (SELECT DISTINCT ON (lower(trim(name))) trim(name) AS name FROM (
             SELECT name FROM contacts WHERE company_id = $1 AND type = 'supplier'
             UNION ALL SELECT supplier_name FROM bills WHERE company_id = $1) x ORDER BY lower(trim(name)), name) n
     LEFT JOIN LATERAL (SELECT * FROM contacts c WHERE c.company_id = $1 AND c.type = 'supplier' AND lower(trim(c.name)) = lower(n.name) LIMIT 1) c ON true
     ORDER BY n.name`,
    [await currentCompanyId()]
  );
  return rows.map((r) => ({ name: r.name, accountName: r.bank_account_name, sortCode: r.bank_sort_code, accountNumber: r.bank_account_number, iban: r.iban, bic: r.bic }));
}

/** Saves a supplier's bank details, adding them to contacts if they're only known from bills. */
export async function updateSupplierBank(name: string, input: BankInput): Promise<void> {
  await ready();
  const supplier = name?.trim();
  if (!supplier) throw new PaymentError("Which supplier?");
  const b = checkBank(input);
  const companyId = await currentCompanyId();
  const pool = getPool();
  const { rows } = await pool.query("SELECT id FROM contacts WHERE company_id = $1 AND type = 'supplier' AND lower(trim(name)) = lower($2) LIMIT 1", [companyId, supplier]);
  const id = rows[0]?.id ?? randomUUID();
  if (!rows[0]) {
    // Keep the spelling already used on their bills.
    const { rows: billName } = await pool.query("SELECT trim(supplier_name) AS name FROM bills WHERE company_id = $1 AND lower(trim(supplier_name)) = lower($2) LIMIT 1", [companyId, supplier]);
    await pool.query(
      "INSERT INTO contacts (id, company_id, name, type, sort_order) VALUES ($1, $2, $3, 'supplier', (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM contacts WHERE company_id = $2))",
      [id, companyId, billName[0]?.name ?? supplier]
    );
  }
  await pool.query("UPDATE contacts SET bank_account_name = $2, bank_sort_code = $3, bank_account_number = $4, iban = $5, bic = $6 WHERE id = $1", [id, b.accountName, b.sortCode, b.accountNumber, b.iban, b.bic]);
}

export type PayableBill = {
  id: string;
  reference: string;
  supplier: string;
  dueDate: string;
  currency: string;
  /** In the bill's own currency. */
  amount: number;
  formats: PaymentFormat[];
  problem: string | null;
  batchReference: string | null;
};

export async function payableBills(): Promise<PayableBill[]> {
  await ready();
  const companyId = await currentCompanyId();
  const { rows } = await getPool().query(
    `SELECT b.*, c.bank_sort_code, c.bank_account_number, c.iban, pb.reference AS batch_reference
     FROM bills b
     LEFT JOIN LATERAL (SELECT * FROM contacts c WHERE c.company_id = b.company_id AND c.type = 'supplier' AND lower(trim(c.name)) = lower(trim(b.supplier_name)) LIMIT 1) c ON true
     LEFT JOIN payment_batches pb ON pb.id = b.payment_batch_id AND pb.status = 'created'
     WHERE b.company_id = $1 AND b.status = 'unpaid'
     ORDER BY b.due_date`,
    [companyId]
  );
  return rows
    .map((b) => {
      const domestic = b.currency === "GBP" && !!b.bank_sort_code && !!b.bank_account_number;
      const formats: PaymentFormat[] = [...(domestic ? (["csv", "bacs18"] as const) : []), ...(b.iban ? (["pain001"] as const) : [])];
      const problem = formats.length ? null : b.currency === "GBP" ? "Add the supplier's sort code and account number, or IBAN" : `Add the supplier's IBAN to pay in ${b.currency}`;
      return {
        id: b.id,
        reference: b.bill_reference,
        supplier: b.supplier_name,
        dueDate: ledgerDate(b.due_date),
        currency: b.currency,
        amount: b.currency === "GBP" ? b.total : b.original_total ?? b.total,
        formats,
        problem,
        batchReference: b.batch_reference,
      };
    })
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

/** Makes a payment file for the chosen bills and holds them in it. */
export async function createPaymentBatch(input: { billIds: string[]; format: PaymentFormat; executionDate: string }): Promise<{ id: string; reference: string; filename: string }> {
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  if (!(input.format in FORMAT_LABELS)) throw new PaymentError("Choose a file format.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.executionDate) || input.executionDate < new Date().toISOString().slice(0, 10)) throw new PaymentError("Choose a payment date from today onwards.");
  const ids = [...new Set(input.billIds ?? [])];
  if (!ids.length) throw new PaymentError("Choose at least one bill to pay.");

  const all = await payableBills();
  const chosen = ids.map((id) => all.find((b) => b.id === id));
  if (chosen.some((b) => !b)) throw new PaymentError("One of those bills is already paid or doesn't exist.");
  const bills = chosen as PayableBill[];
  const held = bills.find((b) => b.batchReference);
  if (held) throw new PaymentError(`${held.reference} is already in payment file ${held.batchReference}.`);
  const unfit = bills.find((b) => !b.formats.includes(input.format));
  if (unfit) throw new PaymentError(`${unfit.reference} (${unfit.supplier}) can't go in this file: ${unfit.problem ?? (unfit.currency === "GBP" ? "the supplier has no UK account details" : `${unfit.currency} needs an ISO 20022 file`)}.`);

  const bank = await getBankDetails();
  const company = (await pool.query("SELECT name FROM companies WHERE id = $1", [companyId])).rows[0].name as string;
  const { rows: supplierRows } = await pool.query("SELECT * FROM contacts WHERE company_id = $1 AND type = 'supplier'", [companyId]);
  const supplierOf = (name: string) => supplierRows.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  const { rows: countRows } = await pool.query("SELECT COUNT(*)::int AS n FROM payment_batches WHERE company_id = $1", [companyId]);
  const reference = `PAY-${input.executionDate.replace(/-/g, "")}-${countRows[0].n + 1}`;
  const pence = (n: number) => Math.round(n * 100);

  let content: string;
  let ext: string;
  if (input.format === "pain001") {
    if (!bank.iban || !bank.bic) throw new PaymentError("Add your own IBAN and BIC under Your bank account first.");
    const payments: Pain001Payment[] = bills.map((b) => {
      const s = supplierOf(b.supplier)!;
      return { endToEndId: b.reference, amountMinor: pence(b.amount), currency: b.currency, creditorName: s.bank_account_name || b.supplier, creditorIban: s.iban, creditorBic: s.bic, remittance: b.reference };
    });
    content = buildPain001({ messageId: reference, createdAt: new Date().toISOString(), executionDate: input.executionDate, debtor: { name: bank.accountName || company, iban: bank.iban, bic: bank.bic }, payments });
    ext = "xml";
  } else {
    const payees: Payee[] = bills.map((b) => {
      const s = supplierOf(b.supplier)!;
      return { name: s.bank_account_name || b.supplier, sortCode: s.bank_sort_code, accountNumber: s.bank_account_number, amountPence: pence(b.amount), reference: sepaText(b.reference, 18) };
    });
    if (input.format === "bacs18") {
      if (!bank.sortCode || !bank.accountNumber || !bank.bacsSun) throw new PaymentError("Bacs files need your sort code, account number and Bacs service user number (Payroll settings).");
      content = standard18(payees, { sortCode: bank.sortCode, accountNumber: bank.accountNumber, name: bank.accountName || company });
      ext = "txt";
    } else {
      content = paymentsCsv(payees);
      ext = "csv";
    }
  }

  const totals = [...new Set(bills.map((b) => b.currency))].map((c) => `${c} ${(bills.filter((b) => b.currency === c).reduce((s, b) => s + pence(b.amount), 0) / 100).toFixed(2)}`).join(", ");
  const id = randomUUID();
  const filename = `${reference}.${ext}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO payment_batches (id, company_id, reference, format, execution_date, payment_count, totals, filename, content, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, companyId, reference, input.format, input.executionDate, bills.length, totals, filename, content, (await getSession()).email]
    );
    // Claim each bill only if nothing else has since; otherwise nothing is kept.
    const res = await client.query("UPDATE bills SET payment_batch_id = $1 WHERE company_id = $2 AND id = ANY($3) AND status = 'unpaid' AND (payment_batch_id IS NULL OR payment_batch_id NOT IN (SELECT id FROM payment_batches WHERE status = 'created'))", [
      id,
      companyId,
      ids,
    ]);
    if (res.rowCount !== ids.length) throw new PaymentError("Some of those bills were just paid or added to another file — refresh and try again.");
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { id, reference, filename };
}

export type PaymentBatch = { id: string; reference: string; format: PaymentFormat; executionDate: string; count: number; totals: string; filename: string; status: string; createdBy: string | null; createdAt: string };

export async function listPaymentBatches(): Promise<PaymentBatch[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT id, reference, format, to_char(execution_date, 'YYYY-MM-DD') AS d, payment_count, totals, filename, status, created_by, to_char(created_at, 'YYYY-MM-DD HH24:MI') AS created
     FROM payment_batches WHERE company_id = $1 ORDER BY created_at DESC`,
    [await currentCompanyId()]
  );
  return rows.map((r) => ({ id: r.id, reference: r.reference, format: r.format, executionDate: r.d, count: r.payment_count, totals: r.totals, filename: r.filename, status: r.status, createdBy: r.created_by, createdAt: r.created }));
}

export async function paymentFile(id: string): Promise<{ filename: string; content: string; type: string }> {
  await ready();
  const { rows } = await getPool().query("SELECT filename, content, format FROM payment_batches WHERE id = $1 AND company_id = $2", [id, await currentCompanyId()]);
  if (!rows[0]) throw new PaymentError("That payment file doesn't exist.");
  const type = rows[0].format === "pain001" ? "application/xml" : rows[0].format === "csv" ? "text/csv" : "text/plain";
  return { filename: rows[0].filename, content: rows[0].content, type };
}

async function openBatch(id: string, companyId: string) {
  const { rows } = await getPool().query("SELECT * FROM payment_batches WHERE id = $1 AND company_id = $2", [id, companyId]);
  if (!rows[0]) throw new PaymentError("That payment file doesn't exist.");
  if (rows[0].status !== "created") throw new PaymentError(`That payment file is already ${rows[0].status}.`);
  return rows[0];
}

/** Once the bank has accepted the file: records each bill as paid, awaiting the statement line. */
export async function markBatchPaid(id: string): Promise<number> {
  await ready();
  const companyId = await currentCompanyId();
  await openBatch(id, companyId);
  const { rows } = await getPool().query("SELECT id FROM bills WHERE payment_batch_id = $1 AND company_id = $2 AND status = 'unpaid'", [id, companyId]);
  for (const b of rows) await payBill(b.id);
  await getPool().query("UPDATE payment_batches SET status = 'paid' WHERE id = $1", [id]);
  return rows.length;
}

/** The bank rejected the file, or it was never uploaded: its bills go back to waiting. */
export async function cancelBatch(id: string): Promise<void> {
  await ready();
  const companyId = await currentCompanyId();
  await openBatch(id, companyId);
  await getPool().query("UPDATE bills SET payment_batch_id = NULL WHERE payment_batch_id = $1 AND company_id = $2", [id, companyId]);
  await getPool().query("UPDATE payment_batches SET status = 'cancelled' WHERE id = $1", [id]);
}
