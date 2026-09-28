import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";

/**
 * Verity Ledger's general ledger — double-entry books that every module posts into, so
 * accounting lives inside Verity rather than being exported to someone else's software.
 * Takes the pool as a parameter (rather than importing lib/db.ts) so both the seed in
 * db.ts and the query layer can use it without a circular import.
 */

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

/** UK small-business numbering (1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx income, 5–8xxx costs). */
export const CHART_OF_ACCOUNTS: Array<{ code: string; name: string; type: AccountType }> = [
  { code: "0010", name: "Fixed assets — cost", type: "asset" },
  { code: "0011", name: "Fixed assets — accumulated depreciation", type: "asset" },
  { code: "1100", name: "Trade debtors", type: "asset" },
  { code: "1200", name: "Bank current account", type: "asset" },
  { code: "2100", name: "Trade creditors", type: "liability" },
  { code: "2200", name: "VAT", type: "liability" },
  { code: "2210", name: "PAYE and NI payable", type: "liability" },
  { code: "2220", name: "Net wages payable", type: "liability" },
  { code: "2230", name: "Pension contributions payable", type: "liability" },
  { code: "2250", name: "Employee expenses payable", type: "liability" },
  { code: "3000", name: "Capital and opening balances", type: "equity" },
  { code: "3200", name: "Retained earnings", type: "equity" },
  { code: "4000", name: "Sales", type: "income" },
  { code: "4900", name: "Other income", type: "income" },
  { code: "5000", name: "Cost of sales", type: "expense" },
  { code: "7000", name: "Gross wages and salaries", type: "expense" },
  { code: "7006", name: "Employer's National Insurance", type: "expense" },
  { code: "7007", name: "Employer's pension contributions", type: "expense" },
  { code: "7100", name: "Rent and rates", type: "expense" },
  { code: "7200", name: "Utilities", type: "expense" },
  { code: "7300", name: "Marketing and advertising", type: "expense" },
  { code: "7400", name: "Travel and subsistence", type: "expense" },
  { code: "7450", name: "Entertainment", type: "expense" },
  { code: "7500", name: "Software and IT", type: "expense" },
  { code: "7600", name: "Professional fees", type: "expense" },
  { code: "7700", name: "Repairs and maintenance", type: "expense" },
  { code: "7800", name: "Printing, postage and stationery", type: "expense" },
  { code: "7900", name: "General expenses", type: "expense" },
  { code: "7950", name: "Foreign exchange gains and losses", type: "expense" },
  { code: "8000", name: "Depreciation", type: "expense" },
];

/** Picks the expense account for a free-text category ("Rent", "Software", "Travel & subsistence"…). */
export function expenseAccountFor(category: string | null | undefined): string {
  const c = (category ?? "").toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/rent|rates|lease/, "7100"],
    [/utilit|electric|gas|water|energy|phone|broadband/, "7200"],
    [/market|advert|promo/, "7300"],
    [/travel|mileage|subsistence|train|taxi|hotel|fuel/, "7400"],
    [/entertain|client meal/, "7450"],
    [/software|saas|it\b|hosting|subscription|computer/, "7500"],
    [/legal|accountan|professional|consult/, "7600"],
    [/repair|maintenance/, "7700"],
    [/print|signage|postage|stationery/, "7800"],
    [/stock|inventory|cost of sales|materials/, "5000"],
  ];
  return rules.find(([re]) => re.test(c))?.[1] ?? "7900";
}

export const PAYROLL_ACCOUNTS = {
  grossWages: "7000",
  employerNi: "7006",
  employerPension: "7007",
  netWagesPayable: "2220",
  payeNiPayable: "2210",
  pensionPayable: "2230",
} as const;

export async function seedChartOfAccounts(pool: Pool, companyId: string): Promise<void> {
  for (let i = 0; i < CHART_OF_ACCOUNTS.length; i++) {
    const a = CHART_OF_ACCOUNTS[i];
    await pool.query(
      `INSERT INTO gl_accounts (company_id, code, name, type, sort_order) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, code) DO NOTHING`,
      [companyId, a.code, a.name, a.type, i]
    );
  }
}

export type JournalLineInput = { accountCode: string; description: string; debit?: number; credit?: number };

/** Fingerprint of a journal's content, so a changed source document is re-posted rather than ignored. */
export function journalHash(date: string, lines: JournalLineInput[]): string {
  return createHash("sha1")
    .update(JSON.stringify([date, lines.map((l) => [l.accountCode, toPence(l.debit ?? 0), toPence(l.credit ?? 0)])]))
    .digest("hex");
}

const toPence = (n: number) => Math.round(n * 100);

/**
 * Posts a balanced journal atomically. Each source document (e.g. one payroll run) can post
 * at most once — a repeat returns the existing journal instead of double-counting.
 */
export async function postJournal(
  pool: Pool,
  input: {
    companyId: string;
    date: string; // YYYY-MM-DD
    narration: string;
    sourceType: string;
    sourceId: string;
    lines: JournalLineInput[];
  }
): Promise<{ journalId: string; created: boolean }> {
  const lines = input.lines
    .map((l) => ({ ...l, debit: toPence(l.debit ?? 0), credit: toPence(l.credit ?? 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);
  const debits = lines.reduce((s, l) => s + l.debit, 0);
  const credits = lines.reduce((s, l) => s + l.credit, 0);
  if (lines.length < 2 || debits !== credits) {
    throw new Error(`Journal doesn't balance: debits ${debits / 100} vs credits ${credits / 100}`);
  }
  if (lines.some((l) => l.debit < 0 || l.credit < 0 || (l.debit && l.credit))) {
    throw new Error("Each journal line must be a single positive debit or credit.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const journalId = randomUUID();
    const inserted = await client.query(
      `INSERT INTO gl_journals (id, company_id, journal_date, narration, source_type, source_id, content_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (company_id, source_type, source_id) WHERE reversed_by IS NULL AND reverses IS NULL DO NOTHING
       RETURNING id`,
      [journalId, input.companyId, input.date, input.narration, input.sourceType, input.sourceId, journalHash(input.date, input.lines)]
    );
    if (!inserted.rowCount) {
      await client.query("ROLLBACK");
      const { rows } = await pool.query(
        "SELECT id FROM gl_journals WHERE company_id = $1 AND source_type = $2 AND source_id = $3 AND reversed_by IS NULL AND reverses IS NULL",
        [input.companyId, input.sourceType, input.sourceId]
      );
      return { journalId: rows[0].id, created: false };
    }
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      await client.query(
        `INSERT INTO gl_journal_lines (id, journal_id, account_code, description, debit, credit, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), journalId, l.accountCode, l.description, l.debit / 100, l.credit / 100, i]
      );
    }
    await client.query("COMMIT");
    return { journalId, created: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Reverses a posted journal: posts the mirror image (debits ↔ credits) dated `date`, and marks
 * the original as reversed so the same source can be posted afresh. Nothing is ever deleted.
 */
export async function reverseJournal(pool: Pool, companyId: string, journalId: string, date: string, reason: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT * FROM gl_journals WHERE id = $1 AND company_id = $2 AND reversed_by IS NULL AND reverses IS NULL FOR UPDATE",
      [journalId, companyId]
    );
    const original = rows[0];
    if (!original) {
      await client.query("ROLLBACK");
      return null;
    }
    const reversalId = randomUUID();
    await client.query(
      `INSERT INTO gl_journals (id, company_id, journal_date, narration, source_type, source_id, reverses)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [reversalId, companyId, date, `Reversal: ${original.narration} — ${reason}`, original.source_type, original.source_id, journalId]
    );
    await client.query(
      `INSERT INTO gl_journal_lines (id, journal_id, account_code, description, debit, credit, sort_order)
       SELECT md5(random()::text || id), $1, account_code, description, credit, debit, sort_order FROM gl_journal_lines WHERE journal_id = $2`,
      [reversalId, journalId]
    );
    await client.query("UPDATE gl_journals SET reversed_by = $1 WHERE id = $2", [reversalId, journalId]);
    await client.query("COMMIT");
    return reversalId;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

type RunForJournal = {
  id: string;
  company_id: string;
  period_label: string;
  pay_period: string;
  payday: string;
  gross_pay: number;
  employer_ni: number;
  employer_pension: number;
  net_pay: number;
  created_at: Date;
  source: string;
  /** DATE read as text — a JS Date would shift a day in non-UTC timezones. */
  pay_date_text: string | null;
  total_tax: number;
  total_employee_ni: number;
  total_employee_pension: number;
  total_student_loan: number;
  employment_allowance_used: number;
  statutory_recovered: number;
};

/** A credit that can come out negative (e.g. a PAYE refund month) is booked as a debit instead. */
function creditOrDebit(accountCode: string, description: string, amount: number): JournalLineInput {
  return amount < 0 ? { accountCode, description, debit: -amount } : { accountCode, description, credit: amount };
}

/** "Wed 30 Sep" + the run's creation year → "2026-09-30"; falls back to the creation date. */
function payrollJournalDate(run: RunForJournal): string {
  if (run.pay_date_text) return run.pay_date_text;
  const created = new Date(run.created_at);
  const parsed = new Date(`${run.payday.replace(/^\w{3}\s+/, "")} ${created.getUTCFullYear()} 12:00 UTC`);
  return (Number.isNaN(parsed.getTime()) ? created : parsed).toISOString().slice(0, 10);
}

/**
 * The accrual journal for an approved payroll run. The whole run's cost is recognised on
 * approval — an employee held back to the next BACS run is still owed this period's pay, so
 * their net pay simply stays in Net wages payable until it's paid.
 *
 *   Dr 7000 Gross wages              gross pay
 *   Dr 7006 Employer's NI            employer NI
 *   Dr 7007 Employer's pension       employer pension
 *     Cr 2220 Net wages payable        net pay
 *     Cr 2210 PAYE and NI payable      employee deductions (gross − net) + employer NI
 *     Cr 2230 Pension payable          employer pension
 */
export async function postPayrollRunJournal(pool: Pool, runId: string): Promise<{ journalId: string; created: boolean }> {
  const { rows } = await pool.query("SELECT *, to_char(pay_date, 'YYYY-MM-DD') AS pay_date_text FROM payroll_runs WHERE id = $1", [runId]);
  const run = rows[0] as (RunForJournal & { status: string }) | undefined;
  if (!run) throw new Error(`Payroll run ${runId} not found`);
  if (!run.status.startsWith("approved")) throw new Error("Only approved payroll runs are posted to the ledger.");

  const a = PAYROLL_ACCOUNTS;
  // Engine runs know exactly what was deducted; sample runs only have gross and net.
  const lines: JournalLineInput[] =
    run.source === "engine"
      ? [
          { accountCode: a.grossWages, description: "Gross pay", debit: run.gross_pay },
          { accountCode: a.employerNi, description: "Employer National Insurance", debit: run.employer_ni },
          { accountCode: a.employerPension, description: "Employer pension contributions", debit: run.employer_pension },
          { accountCode: a.netWagesPayable, description: "Net pay due to employees", credit: run.net_pay },
          creditOrDebit(
            a.payeNiPayable,
            "PAYE, employee and employer NI and student loans due to HMRC",
            run.total_tax + run.total_employee_ni + run.employer_ni + run.total_student_loan
          ),
          {
            accountCode: a.pensionPayable,
            description: "Employee and employer pension due to provider",
            credit: run.total_employee_pension + run.employer_pension,
          },
          // Employment Allowance reduces employer NI owed; statutory pay recovered reduces what's paid to HMRC.
          { accountCode: a.payeNiPayable, description: "Employment Allowance claimed", debit: run.employment_allowance_used },
          { accountCode: a.employerNi, description: "Employment Allowance claimed", credit: run.employment_allowance_used },
          { accountCode: a.payeNiPayable, description: "Statutory pay recovered from HMRC", debit: run.statutory_recovered },
          { accountCode: a.grossWages, description: "Statutory pay recovered from HMRC", credit: run.statutory_recovered },
        ]
      : sampleRunLines(run);
  return postJournal(pool, {
    companyId: run.company_id,
    date: payrollJournalDate(run),
    narration: `Payroll — ${run.period_label} (${run.pay_period})`,
    sourceType: "payroll_run",
    sourceId: run.id,
    lines,
  });
}

function sampleRunLines(run: RunForJournal): JournalLineInput[] {
  const a = PAYROLL_ACCOUNTS;
  const deductions = (toPence(run.gross_pay) - toPence(run.net_pay)) / 100;
  return [
    { accountCode: a.grossWages, description: "Gross pay", debit: run.gross_pay },
    { accountCode: a.employerNi, description: "Employer National Insurance", debit: run.employer_ni },
    { accountCode: a.employerPension, description: "Employer pension contributions", debit: run.employer_pension },
    { accountCode: a.netWagesPayable, description: "Net pay due to employees", credit: run.net_pay },
    {
      accountCode: a.payeNiPayable,
      description: "PAYE, employee deductions and employer NI due to HMRC",
      credit: deductions + run.employer_ni,
    },
    { accountCode: a.pensionPayable, description: "Employer pension due to provider", credit: run.employer_pension },
  ];
}
