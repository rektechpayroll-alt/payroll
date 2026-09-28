import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { postOpeningBankBalance, syncDocument } from "./posting";

/**
 * Two years of trading for sample businesses, as reconciled bank lines — sales receipts,
 * payroll, overheads, owner dividends, and August's wages, PAYE and pension payments. Without
 * it the sample books hold a month of payroll against a handful of invoices and every report
 * reads as a failing business. Going through real bank lines (not summary journals) means the
 * forecast, KPIs and budget suggestions treat the sample exactly as they would a real business.
 */

const MONTHS = 25; // Sep 2024 – Sep 2026
const SEASON = [1.0, 1.04, 0.97, 0.82, 0.88, 0.96, 1.08, 1.1, 1.14, 1.12, 1.06, 1.0]; // Sep → Aug

type Line = { date: string; description: string; amount: number; direction: "credit" | "debit"; account: string };

function monthDate(i: number, day: number): string {
  const d = new Date(Date.UTC(2024, 8 + i, day));
  return d.toISOString().slice(0, 10);
}

export function sampleHistoryLines(augustNetPay: number, augustPaye: number, augustPension: number): Line[] {
  const lines: Line[] = [];
  const r = (n: number) => Math.round(n * 100) / 100;
  for (let i = 0; i < MONTHS; i++) {
    const season = SEASON[i % 12];
    const growth = 1 + 0.004 * i;
    const month = new Date(Date.UTC(2024, 8 + i, 1)).getUTCMonth(); // 0 = Jan
    const label = new Date(Date.UTC(2024, 8 + i, 1)).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).toUpperCase();
    lines.push({ date: monthDate(i, 10), description: `SALES COMMISSIONS ${label}`, amount: r(76000 * season * growth), direction: "credit", account: "4000" });
    lines.push({ date: monthDate(i, 24), description: `LETTINGS MANAGEMENT FEES ${label}`, amount: r(33500 * growth), direction: "credit", account: "4000" });
    lines.push({ date: monthDate(i, 1), description: "HARROW VALE PROPERTIES RENT", amount: 4500, direction: "debit", account: "7100" });
    lines.push({ date: monthDate(i, 3), description: "SOFTWARE SUBSCRIPTIONS", amount: r(1120 + 5 * i), direction: "debit", account: "7500" });
    lines.push({ date: monthDate(i, 5), description: "RIGHTMOVE ZOOPLA LISTINGS", amount: 3150, direction: "debit", account: "7300" });
    lines.push({ date: monthDate(i, 15), description: "OFFICE ENERGY AND BROADBAND", amount: [10, 11, 0, 1].includes(month) ? 880 : 620, direction: "debit", account: "7200" });
    lines.push({ date: monthDate(i, 18), description: "SUNDRY OFFICE COSTS", amount: 380, direction: "debit", account: "7900" });
    lines.push({ date: monthDate(i, 20), description: "STAFF TRAVEL AND MILEAGE", amount: 540, direction: "debit", account: "7400" });
    if ([2, 5, 8, 11].includes(month)) {
      lines.push({ date: monthDate(i, 26), description: "ACCOUNTANCY FEES", amount: 2400, direction: "debit", account: "7600" });
      lines.push({ date: monthDate(i, 28), description: "DIVIDEND TO SHAREHOLDERS", amount: 60000, direction: "debit", account: "3200" });
    }
    // Payroll before the pay runs held in Verity (August 2026 onward).
    if (i < MONTHS - 2) {
      const gross = r(68000 + 280 * i);
      lines.push({ date: monthDate(i, 27), description: `SALARIES PAYE AND PENSIONS ${label}`, amount: gross, direction: "debit", account: "7000" });
      lines.push({ date: monthDate(i, 27), description: `EMPLOYER NI ${label}`, amount: r(gross * 0.082), direction: "debit", account: "7006" });
      lines.push({ date: monthDate(i, 27), description: `EMPLOYER PENSION ${label}`, amount: r(gross * 0.03), direction: "debit", account: "7007" });
    }
  }
  // August 2026's pay run: wages on payday, then HMRC and the pension scheme by the 22nd.
  lines.push({ date: "2026-08-27", description: "BACS SALARIES AUG", amount: augustNetPay, direction: "debit", account: "2220" });
  if (augustPaye) lines.push({ date: "2026-09-22", description: "HMRC PAYE NI AUG", amount: augustPaye, direction: "debit", account: "2210" });
  if (augustPension) lines.push({ date: "2026-09-22", description: "WORKPLACE PENSION AUG", amount: augustPension, direction: "debit", account: "2230" });
  return lines;
}

export async function seedSampleHistory(pool: Pool, companyId: string): Promise<void> {
  const done = await pool.query("SELECT 1 FROM bank_transactions WHERE company_id = $1 AND dedupe_key LIKE 'sample-history:%' LIMIT 1", [companyId]);
  if (done.rowCount) return;

  await postOpeningBankBalance(pool, companyId, "2022-01-01", 120_000);

  // What the August run left owing, straight from its journal.
  const { rows: owed } = await pool.query(
    `SELECT l.account_code, SUM(l.credit - l.debit)::float8 AS owed
     FROM gl_journal_lines l JOIN gl_journals j ON j.id = l.journal_id
     JOIN payroll_runs pr ON pr.id = j.source_id AND pr.company_id = j.company_id
     WHERE j.company_id = $1 AND j.source_type = 'payroll_run' AND pr.period_label = 'August 2026 payroll'
       AND j.reversed_by IS NULL AND j.reverses IS NULL AND l.account_code IN ('2210', '2220', '2230')
     GROUP BY l.account_code`,
    [companyId]
  );
  const owedOn = (code: string) => Math.round((owed.find((o) => o.account_code === code)?.owed ?? 0) * 100) / 100;

  const lines = sampleHistoryLines(owedOn("2220"), owedOn("2210"), owedOn("2230")).filter((l) => l.amount > 0);
  // Safe if two servers start at once: each line is keyed, and only lines this call inserted are posted.
  for (const [n, l] of lines.entries()) {
    const { rows } = await pool.query(
      `INSERT INTO bank_transactions (id, company_id, txn_date, description, amount, direction, status, account_code, source, dedupe_key, reconciled_at, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, 'matched', $7, 'demo', $8, now(), $9)
       ON CONFLICT (company_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id`,
      [randomUUID(), companyId, l.date, l.description, l.amount, l.direction, l.account, `sample-history:${n}`, -1000 + n]
    );
    if (rows[0]) await syncDocument(pool, companyId, "bank_transaction", rows[0].id);
  }

  await pool.query(
    `INSERT INTO recurring_invoices (id, company_id, customer_name, customer_email, items, vat_rate, frequency, next_date, due_days, auto_send, anchor_day, notes)
     SELECT $1, $2, 'Bellcourt Estates Ltd', NULL, $3, 20, 'monthly', '2026-10-01', 14, false, 1, 'Block management retainer'
     WHERE NOT EXISTS (SELECT 1 FROM recurring_invoices WHERE company_id = $2 AND notes = 'Block management retainer')`,
    [randomUUID(), companyId, JSON.stringify([{ description: "Block management retainer", quantity: 1, unitPrice: 2500 }])]
  );
}
