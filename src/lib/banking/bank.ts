import { createHash, randomUUID } from "node:crypto";
import { getPool, ready } from "@/lib/db";
import { postJournal, reverseJournal } from "@/lib/gl";
import { ledgerDate, syncDocument } from "@/lib/ledger/posting";
import { currentCompanyId, getSession } from "@/lib/tenant";
import { assertVatPeriodOpen } from "@/lib/vat/returns";
import { autoMatch, suggestionsFor, type Candidates, type Suggestion } from "./match";
import { parseStatement, type ColumnMapping } from "./parse";

/** Bank statements: import, reconcile against Verity's records, and compare with the books. */

export class BankError extends Error {}

const toPence = (pounds: number) => Math.round(pounds * 100);
const toPounds = (pence: number) => pence / 100;
const BANK_ACCOUNT = "1200";

export type ImportResult = { importId: string; lines: number; imported: number; duplicates: number; errors: string[]; closingBalance: number | null; closingDate: string | null };

/** Parses a statement file and stores its lines, skipping any already imported. */
export async function importStatement(filename: string, text: string, mapping?: ColumnMapping): Promise<ImportResult> {
  await ready();
  const companyId = await currentCompanyId();
  const session = await getSession();
  if (text.length > 5_000_000) throw new BankError("That file is too large — split the statement into smaller date ranges.");
  const parsed = parseStatement(filename, text, mapping);
  if (!parsed.lines.length) throw new BankError(parsed.errors[0] ?? "No transactions found in this file.");

  const pool = getPool();
  const importId = randomUUID();
  // Identical lines in one file (two £3.20 coffees on the same day) are distinct: number them.
  const seen = new Map<string, number>();
  let imported = 0;
  for (const l of parsed.lines) {
    const base = `${l.date}|${l.amount}|${l.description.toLowerCase().replace(/\s+/g, " ")}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const dedupeKey = l.fitId ? `fit:${l.fitId}` : `h:${createHash("sha1").update(`${base}|${n}`).digest("hex")}`;
    const res = await pool.query(
      `INSERT INTO bank_transactions (id, company_id, txn_date, description, amount, direction, status, source, import_id, dedupe_key, balance_after, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, 'unmatched', 'import', $7, $8, $9, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM bank_transactions WHERE company_id = $2))
       ON CONFLICT (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [randomUUID(), companyId, l.date, l.description, toPounds(Math.abs(l.amount)), l.amount >= 0 ? "credit" : "debit", importId, dedupeKey, l.balance === null ? null : toPounds(l.balance)]
    );
    imported += res.rowCount ?? 0;
  }
  // Closing balance: the running balance on the chronologically last line. Statements list
  // oldest-first or newest-first, so on the latest date take the last or first line accordingly.
  const newestFirst = parsed.lines.length > 1 && parsed.lines[0].date > parsed.lines[parsed.lines.length - 1].date;
  const chronological = newestFirst ? [...parsed.lines].reverse() : parsed.lines;
  const closing = [...chronological].reverse().find((l) => l.balance !== null) ?? null;
  await pool.query(
    `INSERT INTO bank_imports (id, company_id, filename, format, line_count, imported_count, duplicate_count, closing_balance, closing_date, imported_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [importId, companyId, filename.slice(0, 200), parsed.format, parsed.lines.length, imported, parsed.lines.length - imported, closing ? toPounds(closing.balance!) : null, closing?.date ?? null, session.email]
  );
  return {
    importId,
    lines: parsed.lines.length,
    imported,
    duplicates: parsed.lines.length - imported,
    errors: parsed.errors,
    closingBalance: closing ? toPounds(closing.balance!) : null,
    closingDate: closing?.date ?? null,
  };
}

export type StatementLineView = {
  id: string;
  date: string;
  description: string;
  amount: number; // signed £
  source: string;
  status: "unmatched" | "matched";
  matchedLabel: string | null;
  suggestions: Suggestion[];
};

async function candidates(companyId: string): Promise<Candidates> {
  const pool = getPool();
  const [inv, bills, runs, recorded, rules] = await Promise.all([
    pool.query("SELECT id, invoice_number, customer_name, total FROM invoices WHERE company_id = $1 AND status = 'sent'", [companyId]),
    pool.query("SELECT id, bill_reference, supplier_name, total FROM bills WHERE company_id = $1 AND status = 'unpaid'", [companyId]),
    pool.query(
      `SELECT id, period_label, net_pay, to_char(pay_date, 'YYYY-MM-DD') AS pay_date FROM payroll_runs
       WHERE company_id = $1 AND source = 'engine' AND status LIKE 'approved%' AND wages_paid_at IS NULL`,
      [companyId]
    ),
    pool.query(
      `SELECT id, txn_date, description, amount, direction FROM bank_transactions
       WHERE company_id = $1 AND source = 'app' AND matched_txn_id IS NULL`,
      [companyId]
    ),
    pool.query(
      "SELECT r.id, r.contains, r.direction, r.account_code, a.name FROM bank_rules r LEFT JOIN gl_accounts a ON a.company_id = r.company_id AND a.code = r.account_code WHERE r.company_id = $1",
      [companyId]
    ),
  ]);
  return {
    invoices: inv.rows.map((r) => ({ id: r.id, number: r.invoice_number, customer: r.customer_name, total: toPence(r.total) })),
    bills: bills.rows.map((r) => ({ id: r.id, reference: r.bill_reference, supplier: r.supplier_name, total: toPence(r.total) })),
    payRuns: runs.rows.map((r) => ({ id: r.id, label: r.period_label, netPay: toPence(r.net_pay), payDate: r.pay_date })),
    recorded: recorded.rows.map((r) => ({ id: r.id, date: ledgerDate(r.txn_date), description: r.description, amount: (r.direction === "credit" ? 1 : -1) * toPence(r.amount) })),
    rules: rules.rows.map((r) => ({ id: r.id, contains: r.contains, direction: r.direction, accountCode: r.account_code, accountName: r.name ?? "" })),
  };
}

/** Statement lines (imported and demo feed), newest first, with reconciliation suggestions for the open ones. */
export async function listStatementLines(filter: "unreconciled" | "all" = "unreconciled"): Promise<StatementLineView[]> {
  await ready();
  const companyId = await currentCompanyId();
  const { rows } = await getPool().query(
    `SELECT t.*, i.invoice_number, i.customer_name, b.bill_reference, b.supplier_name, pr.period_label, a.name AS account_name, rt.description AS recorded_description
     FROM bank_transactions t
     LEFT JOIN invoices i ON i.id = t.matched_invoice_id
     LEFT JOIN bills b ON b.id = t.matched_bill_id
     LEFT JOIN payroll_runs pr ON pr.id = t.matched_payroll_run_id
     LEFT JOIN gl_accounts a ON a.company_id = t.company_id AND a.code = t.account_code
     LEFT JOIN bank_transactions rt ON rt.id = t.matched_txn_id
     WHERE t.company_id = $1 AND t.source IN ('import', 'demo') AND ($2 = 'all' OR t.status = 'unmatched')
     ORDER BY t.sort_order DESC LIMIT 500`,
    [companyId, filter]
  );
  const c = rows.some((r) => r.status === "unmatched") ? await candidates(companyId) : null;
  return rows.map((r) => {
    const amount = (r.direction === "credit" ? 1 : -1) * r.amount;
    const date = ledgerDate(r.txn_date);
    const matchedLabel = r.invoice_number
      ? `Invoice ${r.invoice_number} — ${r.customer_name}`
      : r.bill_reference
        ? `Bill ${r.bill_reference} — ${r.supplier_name}`
        : r.period_label
          ? `Wages — ${r.period_label}`
          : r.account_code
            ? `${r.account_code} ${r.account_name ?? ""}`.trim()
            : r.recorded_description
              ? `Recorded payment: ${r.recorded_description}`
              : r.status === "matched"
                ? "Reconciled"
                : null;
    return {
      id: r.id,
      date,
      description: r.description,
      amount,
      source: r.source,
      status: r.status,
      matchedLabel,
      suggestions: r.status === "unmatched" && c ? suggestionsFor({ id: r.id, date, description: r.description, amount: toPence(amount) }, c) : [],
    };
  });
}

export type ReconcileTarget =
  | { kind: "invoice"; id: string }
  | { kind: "bill"; id: string }
  | { kind: "payroll"; id: string }
  | { kind: "recorded"; id: string }
  | { kind: "account"; accountCode: string; ruleId?: string; vatRate?: number };

async function loadLine(companyId: string, lineId: string) {
  const { rows } = await getPool().query("SELECT * FROM bank_transactions WHERE id = $1 AND company_id = $2 AND source IN ('import', 'demo')", [lineId, companyId]);
  if (!rows[0]) throw new BankError("Statement line not found.");
  return rows[0];
}

export async function reconcileLine(lineId: string, target: ReconcileTarget): Promise<void> {
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  const line = await loadLine(companyId, lineId);
  if (line.status !== "unmatched") throw new BankError("That line is already reconciled — undo it first.");
  const credit = line.direction === "credit";
  const amount = toPence(line.amount);

  if (target.kind === "invoice") {
    const { rows } = await pool.query("SELECT total, status FROM invoices WHERE id = $1 AND company_id = $2", [target.id, companyId]);
    if (!rows[0] || rows[0].status !== "sent") throw new BankError("That invoice isn't open.");
    if (!credit || toPence(rows[0].total) !== amount) throw new BankError("The amount doesn't match the invoice.");
    await pool.query("UPDATE bank_transactions SET status = 'matched', matched_invoice_id = $1, reconciled_at = now() WHERE id = $2", [target.id, lineId]);
    await pool.query("UPDATE invoices SET status = 'paid' WHERE id = $1 AND company_id = $2", [target.id, companyId]);
    await syncDocument(pool, companyId, "invoice", target.id);
  } else if (target.kind === "bill") {
    const { rows } = await pool.query("SELECT total, status FROM bills WHERE id = $1 AND company_id = $2", [target.id, companyId]);
    if (!rows[0] || rows[0].status !== "unpaid") throw new BankError("That bill isn't unpaid.");
    if (credit || toPence(rows[0].total) !== amount) throw new BankError("The amount doesn't match the bill.");
    await pool.query("UPDATE bank_transactions SET status = 'matched', matched_bill_id = $1, reconciled_at = now() WHERE id = $2", [target.id, lineId]);
    await pool.query("UPDATE bills SET status = 'paid' WHERE id = $1 AND company_id = $2", [target.id, companyId]);
    await syncDocument(pool, companyId, "bill", target.id);
  } else if (target.kind === "payroll") {
    const { rows } = await pool.query(
      "SELECT id, net_pay, period_label, wages_paid_at, status, source FROM payroll_runs WHERE id = $1 AND company_id = $2",
      [target.id, companyId]
    );
    const run = rows[0];
    if (!run || run.source !== "engine" || !run.status.startsWith("approved") || run.wages_paid_at) throw new BankError("Those wages aren't waiting to be paid.");
    if (credit || toPence(run.net_pay) !== amount) throw new BankError("The amount doesn't match the net pay.");
    const date = ledgerDate(line.txn_date);
    await pool.query("UPDATE bank_transactions SET status = 'matched', matched_payroll_run_id = $1, reconciled_at = now() WHERE id = $2", [target.id, lineId]);
    await postJournal(pool, {
      companyId,
      date,
      narration: `Wages paid — ${run.period_label}`,
      sourceType: "payroll_payment",
      sourceId: run.id,
      lines: [
        { accountCode: "2220", description: "Net wages", debit: run.net_pay },
        { accountCode: BANK_ACCOUNT, description: "Net wages", credit: run.net_pay },
      ],
    });
    await pool.query("UPDATE payroll_runs SET wages_paid_at = $2 WHERE id = $1", [run.id, date]);
  } else if (target.kind === "recorded") {
    const { rows } = await pool.query(
      "SELECT amount, direction FROM bank_transactions WHERE id = $1 AND company_id = $2 AND source = 'app' AND matched_txn_id IS NULL",
      [target.id, companyId]
    );
    if (!rows[0] || rows[0].direction !== line.direction || toPence(rows[0].amount) !== amount) throw new BankError("That recorded payment doesn't match this line.");
    // The payment is already in the books; the statement line just confirms it.
    await pool.query("UPDATE bank_transactions SET status = 'matched', matched_txn_id = $1, reconciled_at = now() WHERE id = $2", [target.id, lineId]);
    await pool.query("UPDATE bank_transactions SET matched_txn_id = $1 WHERE id = $2", [lineId, target.id]);
  } else {
    const { rows } = await pool.query("SELECT type FROM gl_accounts WHERE company_id = $1 AND code = $2", [companyId, target.accountCode]);
    if (!rows[0]) throw new BankError("Choose an account from your chart of accounts.");
    if (target.accountCode === BANK_ACCOUNT) throw new BankError("A bank line can't be posted to the bank account itself.");
    const vatRate = [20, 5, 0].includes(target.vatRate ?? 0) ? target.vatRate ?? 0 : 0;
    await assertVatPeriodOpen(companyId, line.txn_date, "This bank line");
    await pool.query("UPDATE bank_transactions SET status = 'matched', account_code = $1, rule_id = $2, vat_rate = $3, reconciled_at = now() WHERE id = $4", [
      target.accountCode,
      target.ruleId ?? null,
      vatRate,
      lineId,
    ]);
    await syncDocument(pool, companyId, "bank_transaction", lineId);
  }
}

/** Undoes a reconciliation; anything it posted is reversed, and matched documents go back to open. */
export async function unreconcileLine(lineId: string): Promise<void> {
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  const line = await loadLine(companyId, lineId);
  if (line.status !== "matched") return;
  if (line.account_code) await assertVatPeriodOpen(companyId, line.txn_date, "This bank line");
  await pool.query(
    `UPDATE bank_transactions SET status = 'unmatched', matched_invoice_id = NULL, matched_bill_id = NULL, matched_payroll_run_id = NULL,
       matched_txn_id = NULL, account_code = NULL, rule_id = NULL, vat_rate = 0, reconciled_at = NULL WHERE id = $1`,
    [lineId]
  );
  if (line.matched_invoice_id) {
    await pool.query("UPDATE invoices SET status = 'sent' WHERE id = $1 AND company_id = $2", [line.matched_invoice_id, companyId]);
    await syncDocument(pool, companyId, "invoice", line.matched_invoice_id);
  }
  if (line.matched_bill_id) {
    await pool.query("UPDATE bills SET status = 'unpaid' WHERE id = $1 AND company_id = $2", [line.matched_bill_id, companyId]);
    await syncDocument(pool, companyId, "bill", line.matched_bill_id);
  }
  if (line.matched_payroll_run_id) {
    const { rows } = await pool.query(
      "SELECT id FROM gl_journals WHERE company_id = $1 AND source_type = 'payroll_payment' AND source_id = $2 AND reversed_by IS NULL AND reverses IS NULL",
      [companyId, line.matched_payroll_run_id]
    );
    if (rows[0]) await reverseJournal(pool, companyId, rows[0].id, new Date().toISOString().slice(0, 10), "bank line unmatched");
    await pool.query("UPDATE payroll_runs SET wages_paid_at = NULL WHERE id = $1", [line.matched_payroll_run_id]);
  }
  if (line.matched_txn_id) await pool.query("UPDATE bank_transactions SET matched_txn_id = NULL WHERE id = $1", [line.matched_txn_id]);
  if (line.account_code) await syncDocument(pool, companyId, "bank_transaction", lineId);
}

/** Applies every single, high-confidence suggestion. Returns how many lines it reconciled. */
export async function autoReconcile(): Promise<{ reconciled: number; remaining: number }> {
  let reconciled = 0;
  const lines = await listStatementLines("unreconciled");
  for (const l of lines) {
    const s = autoMatch(l.suggestions);
    if (!s) continue;
    try {
      await reconcileLine(l.id, s.kind === "rule" ? { kind: "account", accountCode: s.accountCode, ruleId: s.id } : { kind: s.kind, id: s.id });
      reconciled++;
    } catch (e) {
      // Another line may have taken the same document first; leave this one for review.
      if (!(e instanceof BankError)) throw e;
    }
  }
  return { reconciled, remaining: lines.length - reconciled };
}

export type BankRule = { id: string; contains: string; direction: "any" | "credit" | "debit"; account_code: string; account_name: string | null };

export async function listRules(): Promise<BankRule[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT r.id, r.contains, r.direction, r.account_code, a.name AS account_name FROM bank_rules r
     LEFT JOIN gl_accounts a ON a.company_id = r.company_id AND a.code = r.account_code
     WHERE r.company_id = $1 ORDER BY r.created_at`,
    [await currentCompanyId()]
  );
  return rows as BankRule[];
}

export async function createRule(contains: string, direction: BankRule["direction"], accountCode: string): Promise<void> {
  await ready();
  const companyId = await currentCompanyId();
  const text = contains.trim();
  if (text.length < 2 || text.length > 100) throw new BankError("Enter the text to look for (2–100 characters).");
  if (!["any", "credit", "debit"].includes(direction)) throw new BankError("Choose money in, money out or either.");
  const { rows } = await getPool().query("SELECT 1 FROM gl_accounts WHERE company_id = $1 AND code = $2", [companyId, accountCode]);
  if (!rows[0] || accountCode === BANK_ACCOUNT) throw new BankError("Choose an account for the rule.");
  await getPool().query("INSERT INTO bank_rules (id, company_id, contains, direction, account_code) VALUES ($1, $2, $3, $4, $5)", [
    randomUUID(),
    companyId,
    text,
    direction,
    accountCode,
  ]);
}

export async function deleteRule(id: string): Promise<void> {
  await ready();
  await getPool().query("DELETE FROM bank_rules WHERE id = $1 AND company_id = $2", [id, await currentCompanyId()]);
}

export type BankSummary = {
  statementBalance: number | null;
  statementDate: string | null;
  booksBalance: number | null;
  difference: number | null;
  unreconciled: number;
  unconfirmed: Array<{ id: string; date: string; description: string; amount: number }>;
  hasOpeningBalance: boolean;
  firstLine: { date: string; balanceBefore: number } | null;
};

/** Statement closing balance vs the bank account in the books at the same date — the reconciliation check. */
export async function bankSummary(): Promise<BankSummary> {
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  const { rows: imp } = await pool.query(
    "SELECT closing_balance, to_char(closing_date, 'YYYY-MM-DD') AS closing_date FROM bank_imports WHERE company_id = $1 AND closing_balance IS NOT NULL ORDER BY closing_date DESC, created_at DESC LIMIT 1",
    [companyId]
  );
  const statementDate: string | null = imp[0]?.closing_date ?? null;
  let booksBalance: number | null = null;
  if (statementDate) {
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(l.debit - l.credit), 0)::float8 AS bal FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
       WHERE j.company_id = $1 AND l.account_code = $2 AND j.journal_date <= $3`,
      [companyId, BANK_ACCOUNT, statementDate]
    );
    booksBalance = Math.round(rows[0].bal * 100) / 100;
  }
  const { rows: counts } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM bank_transactions WHERE company_id = $1 AND source = 'import' AND status = 'unmatched'",
    [companyId]
  );
  const { rows: unconfirmed } = await pool.query(
    "SELECT id, txn_date, description, amount, direction FROM bank_transactions WHERE company_id = $1 AND source = 'app' AND matched_txn_id IS NULL ORDER BY sort_order DESC LIMIT 50",
    [companyId]
  );
  const { rows: ob } = await pool.query(
    "SELECT 1 FROM gl_journals WHERE company_id = $1 AND source_type = 'opening_balance' AND source_id = 'bank' AND reversed_by IS NULL AND reverses IS NULL",
    [companyId]
  );
  // Balance before the earliest imported line = its running balance minus its own amount.
  const { rows: first } = await pool.query(
    `SELECT txn_date, amount, direction, balance_after FROM bank_transactions WHERE company_id = $1 AND source = 'import' AND balance_after IS NOT NULL
     ORDER BY txn_date ASC, sort_order ASC LIMIT 1`,
    [companyId]
  );
  const statementBalance: number | null = imp[0]?.closing_balance ?? null;
  return {
    statementBalance,
    statementDate,
    booksBalance,
    difference: statementBalance !== null && booksBalance !== null ? Math.round((statementBalance - booksBalance) * 100) / 100 : null,
    unreconciled: counts[0].n,
    unconfirmed: unconfirmed.map((r) => ({ id: r.id, date: ledgerDate(r.txn_date), description: r.description, amount: (r.direction === "credit" ? 1 : -1) * r.amount })),
    hasOpeningBalance: !!ob[0],
    firstLine: first[0]
      ? {
          date: ledgerDate(first[0].txn_date),
          balanceBefore: Math.round((first[0].balance_after - (first[0].direction === "credit" ? 1 : -1) * first[0].amount) * 100) / 100,
        }
      : null,
  };
}

/** Sets the books' opening bank balance to the statement's balance before its first line. */
export async function setOpeningBalanceFromStatement(): Promise<void> {
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  const s = await bankSummary();
  if (!s.firstLine) throw new BankError("Import a statement with running balances first.");
  const { rows } = await pool.query(
    "SELECT id FROM gl_journals WHERE company_id = $1 AND source_type = 'opening_balance' AND source_id = 'bank' AND reversed_by IS NULL AND reverses IS NULL",
    [companyId]
  );
  if (rows[0]) await reverseJournal(pool, companyId, rows[0].id, new Date().toISOString().slice(0, 10), "replaced from statement");
  const day = new Date(Date.parse(`${s.firstLine.date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const amount = s.firstLine.balanceBefore;
  if (!amount) return;
  await postJournal(pool, {
    companyId,
    date: day,
    narration: "Opening bank balance (from statement)",
    sourceType: "opening_balance",
    sourceId: "bank",
    lines:
      amount > 0
        ? [
            { accountCode: BANK_ACCOUNT, description: "Opening balance", debit: amount },
            { accountCode: "3000", description: "Opening balance", credit: amount },
          ]
        : [
            { accountCode: "3000", description: "Opening balance", debit: -amount },
            { accountCode: BANK_ACCOUNT, description: "Opening balance", credit: -amount },
          ],
  });
}
