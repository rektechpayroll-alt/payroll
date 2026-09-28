import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { getPool, ready } from "@/lib/db";
import type { Employee } from "@/lib/queries";
import { currentCompanyId } from "@/lib/tenant";
import {
  basicPayForPeriod,
  calculatePayslip,
  contractedHoursForPeriod,
  FREQUENCY_LABELS,
  taxPeriodFor,
  type FlagSeverity,
  type PayFrequency,
  type PayslipFlag,
  type PensionScheme,
} from "./engine";
import { taxYearFor } from "./rates";
import { ABSENCE_TYPES, recoverableAmount, statutoryPayForPeriod, workingDaysBetween, type AbsenceType } from "./statutory";

/**
 * Pay runs calculated by the engine. A run is created as 'open' (a draft: bonuses and
 * hours can still change and every line recalculates), then approved through the existing
 * review flow, which locks it, feeds year-to-date figures and posts the ledger journal.
 */

const toPence = (pounds: number | null | undefined) => Math.round((pounds ?? 0) * 100);
const toPounds = (pence: number) => pence / 100;
const SEVERITY_RANK: Record<FlagSeverity, number> = { critical: 3, serious: 2, warning: 1 };

export class PayRunError extends Error {}

function dateLabel(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { ...opts, timeZone: "UTC" });
}

/** Start dates are free text on older records ("1 Apr 2026"); returns YYYY-MM-DD or null. */
function isoDate(s: string | null): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(`${s} 12:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Period covered by a payment: the calendar month for monthly pay, otherwise the N weeks ending on payday. */
function payPeriod(frequency: PayFrequency, payDate: string): { start: string; end: string; label: string; runLabel: string } {
  if (frequency === "monthly") {
    const [y, m] = payDate.split("-").map(Number);
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return {
      start,
      end,
      label: `${dateLabel(start, { day: "numeric" })}–${dateLabel(end, { day: "numeric", month: "short" })}`,
      runLabel: `${dateLabel(payDate, { month: "long", year: "numeric" })} payroll`,
    };
  }
  const weeks = frequency === "weekly" ? 1 : frequency === "fortnightly" ? 2 : 4;
  const start = addDays(payDate, -(weeks * 7) + 1);
  return {
    start,
    end: payDate,
    label: `${dateLabel(start, { day: "numeric", month: "short" })}–${dateLabel(payDate, { day: "numeric", month: "short" })}`,
    runLabel: `${FREQUENCY_LABELS[frequency]} payroll to ${dateLabel(payDate, { day: "numeric", month: "short", year: "numeric" })}`,
  };
}

/** BACS needs submitting 3 working days before payday. */
function bacsCutoffLabel(payDate: string): string {
  let d = payDate;
  let working = 0;
  while (working < 3) {
    d = addDays(d, -1);
    const day = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6) working++;
  }
  return dateLabel(d, { weekday: "short", day: "numeric", month: "short" });
}

type RunRow = {
  id: string;
  company_id: string;
  status: string;
  source: string;
  frequency: PayFrequency;
  pay_date: string;
  tax_year: string;
  period_start: string;
  period_end: string;
};

type CompanyPayrollSettings = {
  pension_scheme: PensionScheme;
  claim_employment_allowance: boolean;
  small_employer_relief: boolean;
};

type AbsenceRow = {
  id: string;
  type: AbsenceType;
  start_date: string;
  end_date: string;
  average_weekly_earnings: number | null;
  deduct_pay: boolean;
};

const PERIODS: Record<PayFrequency, number> = { weekly: 52, fortnightly: 26, four_weekly: 13, monthly: 12 };

type LineInputs = { additions: number; hoursWorked: number | null };

/** Year-to-date taxable pay and tax for an employee before this payment: approved engine runs earlier in the tax year, plus P45 figures. */
async function ytdFor(client: PoolClient, employee: Employee, run: RunRow) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(pl.taxable_pay), 0)::float8 AS taxable, COALESCE(SUM(pl.income_tax), 0)::float8 AS tax,
            COALESCE(SUM(pl.gross_pay), 0)::float8 AS gross, COALESCE(SUM(pl.employee_ni), 0)::float8 AS ee_ni,
            COALESCE(SUM(pl.employer_ni), 0)::float8 AS er_ni
     FROM payroll_lines pl JOIN payroll_runs pr ON pr.id = pl.run_id
     WHERE pl.employee_id = $1 AND pr.company_id = $2 AND pr.source = 'engine' AND pr.tax_year = $3
       AND pr.status LIKE 'approved%' AND pr.id <> $4 AND pr.pay_date <= $5`,
    [employee.id, run.company_id, run.tax_year, run.id, run.pay_date]
  );
  return {
    taxablePay: toPence(rows[0].taxable) + toPence(employee.previous_pay),
    tax: toPence(rows[0].tax) + toPence(employee.previous_tax),
    gross: toPence(rows[0].gross),
    niablePay: toPence(rows[0].gross),
    employeeNi: toPence(rows[0].ee_ni),
    employerNi: toPence(rows[0].er_ni),
  };
}

/** Statutory pay and docked contractual pay for every absence overlapping the pay period. */
async function absencesFor(client: PoolClient, employee: Employee, run: RunRow) {
  const params = taxYearFor(run.pay_date);
  const { rows } = await client.query(
    `SELECT id, type, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date,
            average_weekly_earnings, deduct_pay
     FROM absences WHERE employee_id = $1 AND company_id = $2 AND start_date <= $4 AND end_date >= $3
     ORDER BY start_date`,
    [employee.id, run.company_id, run.period_start, run.period_end]
  );
  const workingDays = (employee.working_days || "1,2,3,4,5").split(",").map(Number).filter((d) => d >= 0 && d <= 6);
  const flags: PayslipFlag[] = [];
  const breakdown: Array<{ type: AbsenceType; payment: string; days: number; amount: number }> = [];
  let statutory = 0;
  let recoverable = 0;
  let deduction = 0;
  for (const a of rows as AbsenceRow[]) {
    let awe = a.average_weekly_earnings;
    if (awe == null) {
      awe = employee.pay_basis === "salary" ? (employee.annual_salary ?? 0) / 52 : (employee.hourly_rate ?? 0) * employee.weekly_hours;
      flags.push({
        severity: "warning",
        source: "Tax & Statutory",
        tag: "AWE estimated",
        reason: `Average weekly earnings for ${ABSENCE_TYPES[a.type].label.toLowerCase()} were estimated from contracted pay (£${awe.toFixed(2)}). Enter the figure from the 8-week relevant period on the absence to be exact.`,
      });
    }
    const r = statutoryPayForPeriod(params, { type: a.type, startDate: a.start_date, endDate: a.end_date, averageWeeklyEarnings: awe, qualifyingDays: workingDays }, run.period_start, run.period_end);
    if (r.note) flags.push({ severity: r.eligible ? "warning" : "serious", source: "Tax & Statutory", tag: `${ABSENCE_TYPES[a.type].payment} ${r.eligible ? "note" : "not payable"}`, reason: r.note });
    if (r.amount) breakdown.push({ type: a.type, payment: ABSENCE_TYPES[a.type].payment, days: r.days, amount: r.amount / 100 });
    statutory += r.amount;
    if (ABSENCE_TYPES[a.type].recoverable) recoverable += r.amount;
    // Salaried pay stops for the absence days unless the employer tops it up (deduct_pay = false).
    if (a.deduct_pay && employee.pay_basis === "salary" && employee.annual_salary) {
      const from = a.start_date > run.period_start ? a.start_date : run.period_start;
      const to = a.end_date < run.period_end ? a.end_date : run.period_end;
      const days = workingDaysBetween(from, to, workingDays);
      deduction += Math.round((employee.annual_salary * 100 * days) / (52 * Math.max(1, workingDays.length)));
    }
  }
  return { statutory, recoverable, deduction, flags, breakdown };
}

async function previousNet(client: PoolClient, employeeId: string, run: RunRow): Promise<number | null> {
  const { rows } = await client.query(
    `SELECT pl.net_pay FROM payroll_lines pl JOIN payroll_runs pr ON pr.id = pl.run_id
     WHERE pl.employee_id = $1 AND pr.company_id = $2 AND pr.id <> $3 AND pr.status LIKE 'approved%' AND pr.source = 'engine'
     ORDER BY pr.pay_date DESC LIMIT 1`,
    [employeeId, run.company_id, run.id]
  );
  return rows[0] ? toPence(rows[0].net_pay) : null;
}

/** Calculates one employee's payslip for the run and writes it to their line. */
async function calculateLine(client: PoolClient, run: RunRow, employee: Employee, pensionScheme: PensionScheme, lineId: string, inputs: LineInputs) {
  const absence = await absencesFor(client, employee, run);
  const params = taxYearFor(run.pay_date);
  const hours =
    employee.pay_basis === "hourly" ? inputs.hoursWorked ?? contractedHoursForPeriod(run.frequency, employee.weekly_hours) : inputs.hoursWorked;
  const basicPay = basicPayForPeriod(run.frequency, employee.pay_basis, employee.annual_salary, employee.hourly_rate, hours);
  const flags: PayslipFlag[] = [...absence.flags];
  if (!employee.bank_sort_code || !employee.bank_account_number) {
    flags.push({
      severity: "serious",
      source: "Bank & Payments",
      tag: "No bank details",
      reason: "No sort code and account number on file, so this person can't be included in the BACS payment file — add them or pay them another way.",
    });
  }
  if (employee.pay_basis === "salary" && !employee.annual_salary) {
    flags.push({ severity: "critical", source: "Bank & Payments", tag: "No salary set", reason: "Add this employee's salary in their pay details before paying them." });
  }
  if (employee.pay_basis === "hourly" && !employee.hourly_rate) {
    flags.push({ severity: "critical", source: "Bank & Payments", tag: "No hourly rate set", reason: "Add this employee's hourly rate in their pay details before paying them." });
  }

  const ytd = await ytdFor(client, employee, run);
  const slip = calculatePayslip({
    params,
    frequency: run.frequency,
    payDate: run.pay_date,
    employee: {
      taxCode: employee.tax_code,
      niCategory: employee.ni_category,
      studentLoanPlan: employee.student_loan_plan,
      postgradLoan: employee.postgrad_loan,
      pensionEnrolled: employee.pension_enrolled,
      pensionEmployeePct: employee.pension_employee_pct,
      pensionEmployerPct: employee.pension_employer_pct,
      pensionScheme,
      dateOfBirth: employee.date_of_birth,
      isDirector: employee.is_director,
      niNumber: employee.ni_number && !/^tbc$/i.test(employee.ni_number.trim()) ? employee.ni_number : null,
      weeklyHours: employee.weekly_hours,
      payBasis: employee.pay_basis,
      hourlyRate: employee.hourly_rate,
    },
    basicPay,
    additions: toPence(inputs.additions),
    hoursWorked: hours,
    statutoryPay: absence.statutory,
    absenceDeduction: absence.deduction,
    payrolledBenefits: Math.round(((employee.payrolled_benefits_annual ?? 0) * 100) / PERIODS[run.frequency]),
    ytd,
    previousNetPay: await previousNet(client, employee.id, run),
  });
  flags.push(...slip.flags);
  // A mid-year first payment with nothing recorded before it gets every earlier period's
  // allowance at once — right for a genuine new starter, wrong if earlier pay went unrecorded.
  const startDate = isoDate(employee.start_date);
  if (slip.period.number > 1 && ytd.taxablePay === 0 && slip.cumulative && startDate && startDate < run.period_start) {
    flags.push({
      severity: "serious",
      source: "Tax & Statutory",
      tag: "No earlier pay this tax year",
      reason: `This is their first pay in Verity this tax year, but they started before this pay period, so their tax code gives ${slip.period.number} periods' allowance at once. If they were paid earlier this tax year — by you or a previous employer — enter those figures as previous pay (P45) in their pay details.`,
    });
  }
  flags.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const top = flags[0] ?? null;

  await client.query(
    `UPDATE payroll_lines SET
       employee_name = $2, role = $3, basic_pay = $4, additions = $5, hours_worked = $6, gross_pay = $7, taxable_pay = $8,
       income_tax = $9, employee_ni = $10, employer_ni = $11, employee_pension = $12, employer_pension = $13,
       student_loan = $14, postgrad_loan = $15, net_pay = $16, tax_code_used = $17, ni_category_used = $18,
       tax_basis = $19, flags = $20, severity = $21, source = $22, tag_label = $23, reason = $24, resolved = 0,
       statutory_pay = $25, statutory_recoverable_pay = $26, absence_deduction = $27, salary_sacrifice = $28,
       payrolled_benefits = $29, statutory_breakdown = $30, ni_at_lel = $31, ni_lel_to_pt = $32, ni_pt_to_uel = $33,
       employee_pension_basis = $34
     WHERE id = $1`,
    [
      lineId,
      employee.name,
      employee.role,
      toPounds(basicPay),
      inputs.additions,
      hours,
      toPounds(slip.gross),
      toPounds(slip.taxablePay),
      toPounds(slip.tax),
      toPounds(slip.employeeNi),
      toPounds(slip.employerNi),
      toPounds(slip.employeePension),
      toPounds(slip.employerPension),
      toPounds(slip.studentLoan),
      toPounds(slip.postgradLoan),
      toPounds(slip.net),
      slip.taxCodeUsed,
      employee.ni_category,
      slip.cumulative ? "cumulative" : "non-cumulative",
      JSON.stringify(flags),
      top?.severity ?? null,
      top?.source ?? null,
      top?.tag ?? null,
      top?.reason ?? null,
      toPounds(slip.statutoryPay),
      toPounds(absence.recoverable),
      toPounds(slip.absenceDeduction),
      toPounds(slip.salarySacrifice),
      toPounds(slip.payrolledBenefits),
      JSON.stringify(absence.breakdown),
      toPounds(slip.niBands.atLel),
      toPounds(slip.niBands.lelToPt),
      toPounds(slip.niBands.ptToUel),
      pensionScheme,
    ]
  );
}

/** Sums the lines into the run's totals (what the dashboard and the ledger journal read). */
async function refreshTotals(client: PoolClient, runId: string) {
  await sumLines(client, runId);
  const { rows } = await client.query(
    `SELECT pr.company_id, pr.tax_year, to_char(pr.pay_date, 'YYYY-MM-DD') AS pay_date, pr.employer_ni, pr.total_statutory_pay, pr.total_ssp,
            c.claim_employment_allowance, c.small_employer_relief,
            (SELECT COALESCE(SUM(statutory_recoverable_pay), 0) FROM payroll_lines WHERE run_id = pr.id) AS recoverable_pay
     FROM payroll_runs pr JOIN companies c ON c.id = pr.company_id WHERE pr.id = $1`,
    [runId]
  );
  const r = rows[0];
  const params = taxYearFor(r.pay_date);
  const recovered = recoverableAmount(params, toPence(r.recoverable_pay), r.small_employer_relief);
  // Employment Allowance: offset employer NI until the year's allowance is used up.
  let allowance = 0;
  if (r.claim_employment_allowance) {
    const used = await client.query(
      `SELECT COALESCE(SUM(employment_allowance_used), 0)::float8 AS used FROM payroll_runs
       WHERE company_id = $1 AND tax_year = $2 AND id <> $3 AND status LIKE 'approved%'`,
      [r.company_id, r.tax_year, runId]
    );
    const remaining = Math.max(0, params.employmentAllowance * 100 - toPence(used.rows[0].used));
    allowance = Math.min(remaining, toPence(r.employer_ni));
  }
  await client.query("UPDATE payroll_runs SET statutory_recovered = $2, employment_allowance_used = $3 WHERE id = $1", [
    runId,
    toPounds(recovered),
    toPounds(allowance),
  ]);
}

async function sumLines(client: PoolClient, runId: string) {
  await client.query(
    `UPDATE payroll_runs pr SET
       gross_pay = t.gross, net_pay = t.net, employer_ni = t.er_ni, employer_pension = t.er_pen,
       total_tax = t.tax, total_employee_ni = t.ee_ni, total_employee_pension = t.ee_pen, total_student_loan = t.loans,
       total_statutory_pay = t.stat, total_ssp = t.stat - t.recoverable
     FROM (
       SELECT COALESCE(ROUND(SUM(COALESCE(gross_pay, 0))::numeric, 2), 0) AS gross, COALESCE(ROUND(SUM(net_pay)::numeric, 2), 0) AS net,
              COALESCE(ROUND(SUM(COALESCE(employer_ni, 0))::numeric, 2), 0) AS er_ni, COALESCE(ROUND(SUM(COALESCE(employer_pension, 0))::numeric, 2), 0) AS er_pen,
              COALESCE(ROUND(SUM(COALESCE(income_tax, 0))::numeric, 2), 0) AS tax, COALESCE(ROUND(SUM(COALESCE(employee_ni, 0))::numeric, 2), 0) AS ee_ni,
              COALESCE(ROUND(SUM(COALESCE(employee_pension, 0))::numeric, 2), 0) AS ee_pen,
              COALESCE(ROUND(SUM(COALESCE(student_loan, 0) + COALESCE(postgrad_loan, 0))::numeric, 2), 0) AS loans,
              COALESCE(ROUND(SUM(statutory_pay)::numeric, 2), 0) AS stat, COALESCE(ROUND(SUM(statutory_recoverable_pay)::numeric, 2), 0) AS recoverable
       FROM payroll_lines WHERE run_id = $1
     ) t
     WHERE pr.id = $1`,
    [runId]
  );
}

async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function companyPensionScheme(client: PoolClient, companyId: string): Promise<PensionScheme> {
  const { rows } = await client.query("SELECT pension_scheme FROM companies WHERE id = $1", [companyId]);
  return (rows[0] as CompanyPayrollSettings | undefined)?.pension_scheme ?? "relief_at_source";
}

/** Frequencies the business actually pays people on, for the "Run payroll" form. */
export async function getPayFrequenciesInUse(): Promise<PayFrequency[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT DISTINCT pay_frequency FROM employees WHERE company_id = $1 AND leaving_date IS NULL ORDER BY 1`,
    [await currentCompanyId()]
  );
  return rows.map((r) => r.pay_frequency as PayFrequency);
}

/** Creates a draft pay run for every current employee on this frequency and calculates their payslips. */
export async function createPayRun(frequency: PayFrequency, payDate: string): Promise<string> {
  await ready();
  const companyId = await currentCompanyId();
  const params = taxYearFor(payDate); // throws for unsupported tax years
  const period = taxPeriodFor(params, frequency, payDate);
  const dates = payPeriod(frequency, payDate);

  return withTransaction(async (client) => {
    const open = await client.query("SELECT id, period_label FROM payroll_runs WHERE company_id = $1 AND status = 'open'", [companyId]);
    if (open.rowCount) {
      throw new PayRunError(`Approve or delete the open run (${open.rows[0].period_label}) before starting another.`);
    }
    const dupe = await client.query(
      "SELECT 1 FROM payroll_runs WHERE company_id = $1 AND source = 'engine' AND frequency = $2 AND pay_date = $3",
      [companyId, frequency, payDate]
    );
    if (dupe.rowCount) throw new PayRunError("There's already a pay run for this frequency and payday.");

    const { rows: employees } = await client.query(
      `SELECT * FROM employees WHERE company_id = $1 AND pay_frequency = $2
         AND (leaving_date IS NULL OR leaving_date >= $3) ORDER BY sort_order`,
      [companyId, frequency, dates.start]
    );
    if (!employees.length) throw new PayRunError(`Nobody is paid ${FREQUENCY_LABELS[frequency].toLowerCase()} — add employees or check their pay frequency.`);

    const runId = randomUUID();
    await client.query(
      `INSERT INTO payroll_runs (id, company_id, period_label, pay_period, payday, bacs_cutoff_label, status, gross_pay, employer_ni,
         employer_pension, net_pay, connected_balance, mid_month_note, source, frequency, pay_date, tax_year, tax_period, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5, $6, 'open', 0, 0, 0, 0, 0, NULL, 'engine', $7, $8, $9, $10, $11, $12)`,
      [
        runId,
        companyId,
        dates.runLabel,
        dates.label,
        dateLabel(payDate, { weekday: "short", day: "numeric", month: "short" }),
        bacsCutoffLabel(payDate),
        frequency,
        payDate,
        params.label,
        period.number,
        dates.start,
        dates.end,
      ]
    );
    const run: RunRow = {
      id: runId,
      company_id: companyId,
      status: "open",
      source: "engine",
      frequency,
      pay_date: payDate,
      tax_year: params.label,
      period_start: dates.start,
      period_end: dates.end,
    };
    const scheme = await companyPensionScheme(client, companyId);
    for (let i = 0; i < employees.length; i++) {
      const e = employees[i] as Employee;
      const lineId = randomUUID();
      await client.query(
        `INSERT INTO payroll_lines (id, run_id, employee_id, employee_name, role, net_pay, resolved, sort_order) VALUES ($1, $2, $3, $4, $5, 0, 0, $6)`,
        [lineId, runId, e.id, e.name, e.role, i]
      );
      await calculateLine(client, run, e, scheme, lineId, { additions: 0, hoursWorked: null });
    }
    await refreshTotals(client, runId);
    return runId;
  });
}

async function loadOpenRun(client: PoolClient, runId: string, companyId: string): Promise<RunRow> {
  const { rows } = await client.query(
    `SELECT id, company_id, status, source, frequency, to_char(pay_date, 'YYYY-MM-DD') AS pay_date, tax_year,
            to_char(period_start, 'YYYY-MM-DD') AS period_start, to_char(period_end, 'YYYY-MM-DD') AS period_end
     FROM payroll_runs WHERE id = $1 AND company_id = $2 FOR UPDATE`,
    [runId, companyId]
  );
  const run = rows[0] as RunRow | undefined;
  if (!run) throw new PayRunError("Pay run not found.");
  if (run.source !== "engine") throw new PayRunError("Sample runs can't be edited.");
  if (run.status !== "open") throw new PayRunError("This run is approved and locked.");
  return run;
}

/** Changes a line's one-off additions (bonus, overtime…) and/or hours, then recalculates it. */
export async function updatePayLine(lineId: string, inputs: { additions: number; hoursWorked: number | null }) {
  await ready();
  const companyId = await currentCompanyId();
  if (!Number.isFinite(inputs.additions) || inputs.additions < 0 || inputs.additions > 1_000_000) throw new PayRunError("Additions must be between £0 and £1,000,000.");
  if (inputs.hoursWorked !== null && (!Number.isFinite(inputs.hoursWorked) || inputs.hoursWorked < 0 || inputs.hoursWorked > 744)) {
    throw new PayRunError("Hours must be between 0 and 744.");
  }
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT pl.run_id, pl.employee_id FROM payroll_lines pl JOIN payroll_runs pr ON pr.id = pl.run_id
       WHERE pl.id = $1 AND pr.company_id = $2`,
      [lineId, companyId]
    );
    if (!rows[0]) throw new PayRunError("Payslip line not found.");
    const run = await loadOpenRun(client, rows[0].run_id, companyId);
    const { rows: emp } = await client.query("SELECT * FROM employees WHERE id = $1 AND company_id = $2", [rows[0].employee_id, companyId]);
    if (!emp[0]) throw new PayRunError("Employee not found.");
    await calculateLine(client, run, emp[0] as Employee, await companyPensionScheme(client, companyId), lineId, inputs);
    await refreshTotals(client, run.id);
  });
}

/** Re-runs every calculation on an open run — e.g. after changing someone's tax code or salary. */
export async function recalculatePayRun(runId: string) {
  await ready();
  const companyId = await currentCompanyId();
  return withTransaction(async (client) => {
    const run = await loadOpenRun(client, runId, companyId);
    const scheme = await companyPensionScheme(client, companyId);
    const { rows } = await client.query(
      `SELECT pl.id AS line_id, pl.additions, pl.hours_worked, e.* FROM payroll_lines pl JOIN employees e ON e.id = pl.employee_id
       WHERE pl.run_id = $1 AND e.company_id = $2`,
      [run.id, companyId]
    );
    for (const r of rows) {
      const employee = r as Employee & { line_id: string; additions: number; hours_worked: number | null };
      // Hourly staff keep any hours entered; salaried staff never carry hours.
      await calculateLine(client, run, employee, scheme, employee.line_id, {
        additions: employee.additions ?? 0,
        hoursWorked: employee.pay_basis === "hourly" ? employee.hours_worked : null,
      });
    }
    await refreshTotals(client, run.id);
  });
}

/** Deletes a draft run (never an approved one). */
export async function deletePayRun(runId: string) {
  await ready();
  const companyId = await currentCompanyId();
  return withTransaction(async (client) => {
    const run = await loadOpenRun(client, runId, companyId);
    await client.query("DELETE FROM payroll_runs WHERE id = $1", [run.id]);
  });
}

export type PayRunSummary = {
  id: string;
  period_label: string;
  pay_period: string;
  pay_date: string | null;
  frequency: PayFrequency | null;
  status: string;
  source: string;
  gross_pay: number;
  net_pay: number;
  employer_ni: number;
  employer_pension: number;
  total_tax: number;
  total_employee_ni: number;
  total_employee_pension: number;
  total_student_loan: number;
  total_statutory_pay: number;
  total_ssp: number;
  statutory_recovered: number;
  employment_allowance_used: number;
  wages_paid_at: string | null;
  tax_year: string | null;
  tax_period: number | null;
  line_count: number;
};

export async function listPayRuns(): Promise<PayRunSummary[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT pr.id, pr.period_label, pr.pay_period, to_char(pr.pay_date, 'YYYY-MM-DD') AS pay_date, pr.frequency, pr.status, pr.source,
            pr.gross_pay, pr.net_pay, pr.employer_ni, pr.employer_pension, pr.total_tax, pr.total_employee_ni,
            pr.total_employee_pension, pr.total_student_loan, pr.total_statutory_pay, pr.total_ssp, pr.statutory_recovered,
            pr.employment_allowance_used, to_char(pr.wages_paid_at, 'YYYY-MM-DD') AS wages_paid_at, pr.tax_year, pr.tax_period,
            (SELECT COUNT(*)::int FROM payroll_lines pl WHERE pl.run_id = pr.id) AS line_count
     FROM payroll_runs pr WHERE pr.company_id = $1 ORDER BY pr.created_at DESC`,
    [await currentCompanyId()]
  );
  return rows as PayRunSummary[];
}

export async function getPayRun(runId: string): Promise<PayRunSummary | null> {
  return (await listPayRuns()).find((r) => r.id === runId) ?? null;
}

export type PayslipLine = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  role: string;
  basic_pay: number | null;
  additions: number;
  hours_worked: number | null;
  gross_pay: number | null;
  taxable_pay: number | null;
  income_tax: number | null;
  employee_ni: number | null;
  employer_ni: number | null;
  employee_pension: number | null;
  employer_pension: number | null;
  student_loan: number | null;
  postgrad_loan: number | null;
  net_pay: number;
  tax_code_used: string | null;
  ni_category_used: string | null;
  tax_basis: string | null;
  flags: PayslipFlag[] | null;
  statutory_pay: number;
  absence_deduction: number;
  salary_sacrifice: number;
  payrolled_benefits: number;
  statutory_breakdown: Array<{ type: AbsenceType; payment: string; days: number; amount: number }> | null;
  severity: FlagSeverity | null;
  resolved: number;
  pay_basis: "salary" | "hourly" | null;
  ni_number: string | null;
  bank_account_name: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
};

export async function getPayslipLines(runId: string): Promise<PayslipLine[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT pl.*, e.pay_basis, e.ni_number, e.bank_account_name, e.bank_sort_code, e.bank_account_number FROM payroll_lines pl
     JOIN payroll_runs pr ON pr.id = pl.run_id
     LEFT JOIN employees e ON e.id = pl.employee_id
     WHERE pl.run_id = $1 AND pr.company_id = $2 ORDER BY pl.sort_order`,
    [runId, await currentCompanyId()]
  );
  return rows as PayslipLine[];
}

/** Year-to-date totals for one employee up to and including a run (for the payslip's YTD column). */
export async function getYearToDate(employeeId: string, runId: string) {
  await ready();
  const companyId = await currentCompanyId();
  const { rows } = await getPool().query(
    `SELECT COALESCE(SUM(pl.gross_pay), 0)::float8 AS gross, COALESCE(SUM(pl.taxable_pay), 0)::float8 AS taxable,
            COALESCE(SUM(pl.income_tax), 0)::float8 AS tax, COALESCE(SUM(pl.employee_ni), 0)::float8 AS ni,
            COALESCE(SUM(pl.employee_pension), 0)::float8 AS pension
     FROM payroll_lines pl JOIN payroll_runs pr ON pr.id = pl.run_id
     JOIN payroll_runs cur ON cur.id = $2 AND cur.company_id = $3
     WHERE pl.employee_id = $1 AND pr.company_id = $3 AND pr.source = 'engine' AND pr.tax_year = cur.tax_year
       AND (pr.id = cur.id OR (pr.status LIKE 'approved%' AND pr.pay_date <= cur.pay_date))`,
    [employeeId, runId, companyId]
  );
  return rows[0] as { gross: number; taxable: number; tax: number; ni: number; pension: number };
}
