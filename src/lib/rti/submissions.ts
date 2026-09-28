import { randomUUID } from "node:crypto";
import { getPool, ready } from "@/lib/db";
import { niBandEarnings, type PayFrequency } from "@/lib/payroll/engine";
import { taxYearFor } from "@/lib/payroll/rates";
import { fpsTaxCode, parseTaxCode } from "@/lib/payroll/taxcode";
import { currentCompanyId, getSession } from "@/lib/tenant";
import { buildEps, type EpsInput } from "./eps";
import { buildFps, type EmployerRefs, type FpsEmployee } from "./fps";
import { buildGovTalkMessage, buildProtocolMessage, type RtiKind } from "./govtalk";
import { postToHmrc, rtiEnvironment } from "./transport";

/**
 * Turns Verity's payroll data into HMRC RTI submissions and tracks them through HMRC's
 * submit → poll → delete conversation. Government Gateway credentials are used for the one
 * request and never stored.
 */

export class RtiError extends Error {}

const PAY_FREQ: Record<PayFrequency, "W1" | "W2" | "W4" | "M1"> = { weekly: "W1", fortnightly: "W2", four_weekly: "W4", monthly: "M1" };
const NINO = /^(?!BG|GB|NK|KN|TN|NT|ZZ)[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\d{6}[A-D]$/;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** HMRC's "26-27" form of the tax year containing a pay date. */
export function relatedTaxYear(payDate: string): string {
  return shortTaxYear(taxYearFor(payDate).label);
}

/** "2026-27" → "26-27". */
const shortTaxYear = (label: string) => `${label.slice(2, 4)}-${label.slice(5, 7)}`;

function employerRefs(c: { paye_reference: string | null; accounts_office_reference: string | null }): EmployerRefs {
  const m = c.paye_reference?.match(/^(\d{3})\/([A-Z0-9]{1,10})$/);
  if (!m || !c.accounts_office_reference) {
    throw new RtiError("Add your employer PAYE reference and Accounts Office reference in Settings → Payroll & HMRC first.");
  }
  return { officeNo: m[1], payeRef: m[2], aoRef: c.accounts_office_reference };
}

function parseStartDate(s: string | null): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(`${s} 12:00 UTC`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function hoursBand(weekly: number): FpsEmployee["payment"]["hoursBand"] {
  if (!(weekly > 0)) return "E";
  return weekly < 16 ? "A" : weekly < 24 ? "B" : weekly < 30 ? "C" : "D";
}

export type FpsPreview = { doc: ReturnType<typeof buildFps>; problems: string[]; employeeCount: number };

/** Builds the FPS for an approved engine run, listing anything HMRC would reject. */
export async function prepareFps(runId: string): Promise<FpsPreview> {
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  const { rows: runRows } = await pool.query(
    `SELECT pr.*, to_char(pr.pay_date, 'YYYY-MM-DD') AS pay_date_text, c.paye_reference, c.accounts_office_reference
     FROM payroll_runs pr JOIN companies c ON c.id = pr.company_id WHERE pr.id = $1 AND pr.company_id = $2`,
    [runId, companyId]
  );
  const run = runRows[0];
  if (!run) throw new RtiError("Pay run not found.");
  if (run.source !== "engine") throw new RtiError("Only pay runs calculated by Verity can be filed with HMRC.");
  if (!run.status.startsWith("approved")) throw new RtiError("Approve the pay run before filing it.");
  const refs = employerRefs(run);
  const payDate: string = run.pay_date_text;
  const params = taxYearFor(payDate);

  const { rows: lines } = await pool.query(
    `SELECT pl.*, e.name AS emp_name, e.ni_number, e.date_of_birth, e.gender, e.address_line1, e.address_line2, e.postcode,
            e.payroll_id, e.start_date, e.starter_declaration, e.leaving_date, e.is_director, e.student_loan_plan,
            e.postgrad_loan, e.weekly_hours, e.tax_code
     FROM payroll_lines pl JOIN employees e ON e.id = pl.employee_id
     WHERE pl.run_id = $1 AND e.company_id = $2 ORDER BY pl.sort_order`,
    [runId, companyId]
  );

  const problems: string[] = [];
  const employees: FpsEmployee[] = [];
  for (const l of lines) {
    // Year to date in this employment (not P45 figures), up to and including this run.
    const { rows: ytdRows } = await pool.query(
      `SELECT pl.* FROM payroll_lines pl JOIN payroll_runs pr ON pr.id = pl.run_id
       WHERE pl.employee_id = $1 AND pr.company_id = $2 AND pr.source = 'engine' AND pr.tax_year = $3
         AND pr.status LIKE 'approved%' AND pr.pay_date <= $4`,
      [l.employee_id, companyId, run.tax_year, payDate]
    );
    const sum = (k: string) => round2(ytdRows.reduce((s, r) => s + Number(r[k] ?? 0), 0));
    const pensionBy = (basis: string) => round2(ytdRows.filter((r) => r.employee_pension_basis === basis).reduce((s, r) => s + Number(r.employee_pension ?? 0), 0));
    const stat = (payment: string) =>
      round2(ytdRows.reduce((s, r) => s + ((r.statutory_breakdown ?? []) as Array<{ payment: string; amount: number }>).filter((b) => b.payment === payment).reduce((a, b) => a + b.amount, 0), 0));

    const nino = String(l.ni_number ?? "").replace(/\s/g, "").toUpperCase();
    const validNino = NINO.test(nino) ? nino : null;
    const parts = String(l.emp_name).trim().split(/\s+/);
    const who = l.emp_name;
    if (!l.gender) problems.push(`${who}: gender (as held by HMRC) is required.`);
    if (!validNino && !(l.address_line1 && l.postcode)) problems.push(`${who}: no valid NI number, so HMRC needs their address and postcode.`);
    if (!validNino && !l.date_of_birth) problems.push(`${who}: no valid NI number, so HMRC needs their date of birth.`);
    if (parts.length < 2) problems.push(`${who}: HMRC needs a first name and a surname.`);

    const code = parseTaxCode(l.tax_code_used ?? l.tax_code ?? "");
    const taxCode = code ? fpsTaxCode(code) : "1257L";
    const startDate = parseStartDate(l.start_date);
    const earlier = ytdRows.some((r) => r.run_id !== runId);
    const isStarter = !!startDate && startDate >= params.startDate && !earlier;
    const grossYtd = sum("gross_pay");
    const bands = l.is_director
      ? niBandEarnings(params, "annual", Math.round(grossYtd * 100))
      : { atLel: Math.round(sum("ni_at_lel") * 100), lelToPt: Math.round(sum("ni_lel_to_pt") * 100), ptToUel: Math.round(sum("ni_pt_to_uel") * 100) };
    const rasPension = l.employee_pension_basis === "relief_at_source" ? Number(l.employee_pension ?? 0) : 0;
    const netPayPension = l.employee_pension_basis === "net_pay" ? Number(l.employee_pension ?? 0) : 0;

    employees.push({
      nino: validNino,
      forename: parts.slice(0, -1).join(" ") || parts[0],
      surname: parts[parts.length - 1],
      address: l.address_line1 || l.postcode ? { lines: [l.address_line1, l.address_line2].filter(Boolean), postcode: l.postcode } : null,
      birthDate: l.date_of_birth,
      gender: l.gender === "M" ? "M" : "F",
      director: !!l.is_director,
      starter: isStarter ? { startDate: startDate!, declaration: l.starter_declaration, studentLoan: !!l.student_loan_plan, postgradLoan: !!l.postgrad_loan } : null,
      payId: (l.payroll_id || String(l.employee_id).replace(/-/g, "")).slice(0, 35),
      leavingDate: l.leaving_date && l.leaving_date <= payDate ? l.leaving_date : null,
      ytd: {
        taxablePay: sum("taxable_pay"),
        tax: sum("income_tax"),
        studentLoan: l.student_loan_plan ? sum("student_loan") : null,
        postgradLoan: l.postgrad_loan ? sum("postgrad_loan") : null,
        benefits: sum("payrolled_benefits"),
        pensionNetPay: pensionBy("net_pay"),
        pensionNotNetPay: pensionBy("relief_at_source"),
        smp: stat("SMP"),
        spp: stat("SPP"),
        sap: stat("SAP"),
        shpp: stat("ShPP"),
        spbp: stat("SPBP"),
        sncp: stat("SNCP"),
      },
      payment: {
        payFreq: PAY_FREQ[run.frequency as PayFrequency],
        pmtDate: payDate,
        weekNo: run.frequency === "monthly" ? null : run.tax_period,
        monthNo: run.frequency === "monthly" ? run.tax_period : null,
        hoursBand: hoursBand(Number(l.weekly_hours)),
        taxCode,
        nonCumulative: l.tax_basis === "non-cumulative",
        regime: code?.regime === "scotland" ? "S" : code?.regime === "wales" ? "C" : null,
        taxablePay: Number(l.taxable_pay ?? 0),
        dednsFromNetPay: rasPension,
        payAfterStatDedns: round2(Number(l.net_pay) + rasPension + Number(l.payrolled_benefits ?? 0)),
        benefits: Number(l.payrolled_benefits ?? 0),
        pensionNetPay: netPayPension,
        pensionNotNetPay: rasPension,
        studentLoan: l.student_loan_plan ? { plan: `0${l.student_loan_plan}` as "01" | "02" | "04" | "05", amount: Number(l.student_loan ?? 0) } : null,
        postgradLoan: l.postgrad_loan ? Number(l.postgrad_loan ?? 0) : null,
        tax: Number(l.income_tax ?? 0),
        unpaidAbsence: Number(l.absence_deduction ?? 0) > 0,
      },
      ni: {
        letter: l.ni_category_used ?? "A",
        grossPd: Number(l.gross_pay ?? 0),
        grossYtd,
        atLelYtd: bands.atLel / 100,
        lelToPtYtd: bands.lelToPt / 100,
        ptToUelYtd: bands.ptToUel / 100,
        employerPd: Number(l.employer_ni ?? 0),
        employerYtd: sum("employer_ni"),
        employeePd: Number(l.employee_ni ?? 0),
        employeeYtd: sum("employee_ni"),
      },
    });
  }
  if (!employees.length) problems.push("This run has no employees to report.");
  return { doc: buildFps({ relatedTaxYear: relatedTaxYear(payDate), employer: refs, employees }), problems, employeeCount: employees.length };
}

/** Year-to-date EPS figures for a tax month: statutory pay recovered and the Employment Allowance claim. taxYear is "2026-27". */
export async function prepareEps(taxYear: string, taxMonth: number, opts: { noPayment?: boolean } = {}) {
  if (!/^\d{4}-\d{2}$/.test(taxYear) || !(taxMonth >= 1 && taxMonth <= 12)) throw new RtiError("Choose a tax year and month.");
  await ready();
  const companyId = await currentCompanyId();
  const pool = getPool();
  const { rows: cRows } = await pool.query(
    "SELECT paye_reference, accounts_office_reference, claim_employment_allowance, small_employer_relief FROM companies WHERE id = $1",
    [companyId]
  );
  const c = cRows[0];
  const refs = employerRefs(c);
  const { rows } = await pool.query(
    `SELECT pl.statutory_breakdown, to_char(pr.pay_date, 'YYYY-MM-DD') AS pay_date FROM payroll_lines pl JOIN payroll_runs pr ON pr.id = pl.run_id
     WHERE pr.company_id = $1 AND pr.source = 'engine' AND pr.tax_year = $2 AND pr.status LIKE 'approved%'`,
    [companyId, taxYear]
  );
  const params = taxYearFor(`${taxYear.slice(0, 4)}-04-06`);
  const totals: Record<string, number> = { SMP: 0, SPP: 0, SAP: 0, ShPP: 0, SPBP: 0, SNCP: 0 };
  for (const r of rows) {
    const [y, m, d] = r.pay_date.split("-").map(Number);
    const month = y * 12 + m - (Number(params.startDate.slice(0, 4)) * 12 + 4) + (d >= 6 ? 1 : 0);
    if (month > taxMonth) continue;
    for (const b of (r.statutory_breakdown ?? []) as Array<{ payment: string; amount: number }>) if (b.payment in totals) totals[b.payment] += b.amount;
  }
  // Small Employers' Relief: recover 100% plus compensation; otherwise recover 92%.
  const ser = !!c.small_employer_relief;
  const recovered = (v: number) => round2(v * (ser ? 1 : params.statutory.recoveryRate));
  const comp = (v: number) => round2(v * (params.statutory.smallEmployerRecoveryRate - 1));
  const anyRecoverable = Object.values(totals).some((v) => v > 0);
  const startYear = Number(params.startDate.slice(0, 4));
  const monthStart = new Date(Date.UTC(startYear, 3 + taxMonth - 1, 6)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(startYear, 3 + taxMonth, 5)).toISOString().slice(0, 10);
  if (opts.noPayment && monthStart > new Date().toISOString().slice(0, 10)) {
    throw new RtiError("You can only tell HMRC nobody was paid for a tax month that has already started.");
  }
  const input: EpsInput = {
    relatedTaxYear: shortTaxYear(taxYear),
    employer: refs,
    noPaymentForPeriod: opts.noPayment ? { from: monthStart, to: monthEnd } : undefined,
    employmentAllowance: !!c.claim_employment_allowance,
    recoverable: anyRecoverable
      ? {
          taxMonth,
          smp: recovered(totals.SMP),
          spp: recovered(totals.SPP),
          sap: recovered(totals.SAP),
          shpp: recovered(totals.ShPP),
          spbp: recovered(totals.SPBP),
          sncp: recovered(totals.SNCP),
          compensation: ser
            ? { smp: comp(totals.SMP), spp: comp(totals.SPP), sap: comp(totals.SAP), shpp: comp(totals.ShPP), spbp: comp(totals.SPBP), sncp: comp(totals.SNCP) }
            : undefined,
        }
      : undefined,
  };
  return { doc: buildEps(input), totals, recovered: input.recoverable };
}

export type RtiSubmission = {
  id: string;
  kind: RtiKind;
  run_id: string | null;
  tax_year: string;
  tax_month: number | null;
  test_in_live: boolean;
  environment: string;
  status: "submitted" | "accepted" | "rejected" | "error";
  irmark: string | null;
  correlation_id: string | null;
  errors: Array<{ number: string | null; text: string; location: string | null }> | null;
  submitted_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function listRtiSubmissions(runId?: string): Promise<RtiSubmission[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT id, kind, run_id, tax_year, tax_month, test_in_live, environment, status, irmark, correlation_id, errors, submitted_by,
            to_char(created_at AT TIME ZONE 'Europe/London', 'DD Mon YYYY, HH24:MI') AS created_at,
            to_char(updated_at AT TIME ZONE 'Europe/London', 'DD Mon YYYY, HH24:MI') AS updated_at
     FROM rti_submissions WHERE company_id = $1 AND ($2::text IS NULL OR run_id = $2) ORDER BY rti_submissions.created_at DESC LIMIT 50`,
    [await currentCompanyId(), runId ?? null]
  );
  return rows as RtiSubmission[];
}

/** The GovTalk XML with placeholder credentials — for downloading or HMRC's Local Test Service. */
export function envelopeForDownload(kind: RtiKind, doc: Parameters<typeof buildGovTalkMessage>[0], testInLive: boolean) {
  const env = rtiEnvironment();
  return buildGovTalkMessage(doc, {
    kind,
    testInLive,
    gatewayTest: env.gatewayTest,
    senderId: "GATEWAY-USER-ID",
    password: "GATEWAY-PASSWORD",
    vendorId: env.vendorId ?? "VENDOR-ID",
    product: "Verity",
    version: "1.0",
  });
}

/** Sends an FPS or EPS to HMRC. Credentials are used for this request only and never stored. */
export async function submitRti(input: {
  kind: RtiKind;
  runId: string | null;
  taxYear: string;
  taxMonth: number | null;
  doc: Parameters<typeof buildGovTalkMessage>[0];
  credentials: { senderId: string; password: string };
  testInLive: boolean;
}): Promise<RtiSubmission> {
  await ready();
  const companyId = await currentCompanyId();
  const session = await getSession();
  const env = rtiEnvironment();
  if (!env.vendorId) {
    throw new RtiError("Verity isn't registered with HMRC yet — set HMRC_VENDOR_ID (issued by HMRC's Software Developer Support Team) before submitting.");
  }
  if (!input.credentials.senderId || !input.credentials.password) throw new RtiError("Enter your Government Gateway user ID and password.");

  const { xml, irmark } = buildGovTalkMessage(input.doc, {
    kind: input.kind,
    testInLive: input.testInLive,
    gatewayTest: env.gatewayTest,
    senderId: input.credentials.senderId,
    password: input.credentials.password,
    vendorId: env.vendorId,
    product: "Verity",
    version: "1.0",
  });
  // Never persist the password: store the request with credentials blanked out.
  const storedXml = xml.replace(/<SenderID>[^<]*<\/SenderID>/, "<SenderID>***</SenderID>").replace(/<Value>[^<]*<\/Value>/, "<Value>***</Value>");
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO rti_submissions (id, company_id, kind, run_id, tax_year, tax_month, test_in_live, environment, status, irmark, request_xml, submitted_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'submitted', $9, $10, $11)`,
    [id, companyId, input.kind, input.runId, input.taxYear, input.taxMonth, input.testInLive, env.name, irmark.base32, storedXml, session.email]
  );

  let result;
  try {
    result = await postToHmrc(env.endpoint, xml);
  } catch (e) {
    await recordOutcome(id, "error", null, [{ number: null, text: `Couldn't reach HMRC: ${e instanceof Error ? e.message : e}`, location: null }], null, null, null);
    return (await listRtiSubmissions()).find((s) => s.id === id)!;
  }
  if (result.qualifier === "acknowledgement") {
    await recordOutcome(id, "submitted", result.raw, null, result.correlationId, result.endpoint, result.pollInterval);
  } else if (result.qualifier === "response") {
    await recordOutcome(id, "accepted", result.raw, null, result.correlationId, null, null);
  } else {
    await recordOutcome(id, "rejected", result.raw, result.errors.length ? result.errors : [{ number: null, text: "HMRC rejected the submission.", location: null }], result.correlationId, null, null);
  }
  return (await listRtiSubmissions()).find((s) => s.id === id)!;
}

async function recordOutcome(
  id: string,
  status: RtiSubmission["status"],
  responseXml: string | null,
  errors: RtiSubmission["errors"],
  correlationId: string | null,
  pollUrl: string | null,
  pollInterval: number | null
) {
  await getPool().query(
    `UPDATE rti_submissions SET status = $2, response_xml = COALESCE($3, response_xml), errors = $4,
       correlation_id = COALESCE($5, correlation_id), poll_url = $6, poll_interval = $7, updated_at = now()
     WHERE id = $1`,
    [id, status, responseXml, errors ? JSON.stringify(errors) : null, correlationId, pollUrl, pollInterval]
  );
}

/** Asks HMRC for the outcome of a submitted FPS/EPS; once final, deletes the response from HMRC's servers. */
export async function pollRti(submissionId: string): Promise<RtiSubmission> {
  await ready();
  const companyId = await currentCompanyId();
  const env = rtiEnvironment();
  const { rows } = await getPool().query("SELECT * FROM rti_submissions WHERE id = $1 AND company_id = $2", [submissionId, companyId]);
  const s = rows[0];
  if (!s) throw new RtiError("Submission not found.");
  if (s.status !== "submitted" || !s.correlation_id) return (await listRtiSubmissions()).find((x) => x.id === submissionId)!;

  const pollUrl = s.poll_url || env.endpoint.replace(/submission$/, "poll");
  const result = await postToHmrc(pollUrl, buildProtocolMessage(s.kind, s.test_in_live, env.gatewayTest, "poll", "submit", s.correlation_id));
  if (result.qualifier === "acknowledgement") {
    await recordOutcome(submissionId, "submitted", null, null, null, result.endpoint ?? s.poll_url, result.pollInterval ?? s.poll_interval);
  } else {
    const accepted = result.qualifier === "response";
    await recordOutcome(submissionId, accepted ? "accepted" : "rejected", result.raw, accepted ? null : result.errors, null, null, null);
    // Tidy up on HMRC's side; failures here don't change the outcome we've recorded.
    await postToHmrc(env.endpoint, buildProtocolMessage(s.kind, s.test_in_live, env.gatewayTest, "request", "delete", s.correlation_id)).catch(() => {});
  }
  return (await listRtiSubmissions()).find((x) => x.id === submissionId)!;
}
