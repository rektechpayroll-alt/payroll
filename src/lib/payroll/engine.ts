import type { TaxBands, TaxYearParams } from "./rates";
import { parseTaxCode, type ParsedTaxCode } from "./taxcode";

/**
 * Verity's UK payroll engine. Pure functions, no I/O — every figure on a payslip comes
 * from here. All money is integer pence; PAYE follows HMRC's "Specification for PAYE Tax
 * Table Routines" (v24.0) exactly, including its 4-decimal-place truncation rules, using
 * integer arithmetic so there's no floating-point drift.
 */

export type PayFrequency = "weekly" | "fortnightly" | "four_weekly" | "monthly";

export const FREQUENCY_LABELS: Record<PayFrequency, string> = {
  weekly: "Weekly",
  fortnightly: "Fortnightly",
  four_weekly: "Four-weekly",
  monthly: "Monthly",
};

/** Weeks covered by one payment, for weekly-based schedules. */
const WEEKS_PER_PERIOD: Record<Exclude<PayFrequency, "monthly">, number> = { weekly: 1, fortnightly: 2, four_weekly: 4 };
const PERIODS_PER_YEAR: Record<PayFrequency, number> = { weekly: 52, fortnightly: 26, four_weekly: 13, monthly: 12 };

export type NiCategory = "A" | "B" | "C" | "H" | "J" | "M" | "V" | "X" | "Z";
export const NI_CATEGORIES: Record<NiCategory, string> = {
  A: "A — Standard",
  B: "B — Married women's reduced rate",
  C: "C — Over State Pension age",
  H: "H — Apprentice under 25",
  J: "J — Deferred (2%)",
  M: "M — Under 21",
  V: "V — Veteran (first year)",
  X: "X — Exempt (under 16)",
  Z: "Z — Under 21, deferred",
};

export type StudentLoanPlan = "1" | "2" | "4" | "5" | null;
export type PensionScheme = "relief_at_source" | "net_pay" | "salary_sacrifice";

export const PENSION_SCHEMES: Record<PensionScheme, string> = {
  relief_at_source: "Relief at source (e.g. NEST) — taken from net pay",
  net_pay: "Net pay arrangement — taken before tax",
  salary_sacrifice: "Salary sacrifice — pay reduced before tax and NI",
};

export type FlagSeverity = "critical" | "serious" | "warning";
export type PayslipFlag = { severity: FlagSeverity; source: string; tag: string; reason: string };

// ---------------------------------------------------------------------------
// Tax periods
// ---------------------------------------------------------------------------

export type TaxPeriod = {
  /** Tax week (1–53) for weekly-based schedules, tax month (1–12) for monthly. */
  number: number;
  /** The divisor HMRC's routine uses: 52 for weekly-based schedules, 12 for monthly. */
  base: 52 | 12;
  /** Weeks (or months) covered by one payment: 1, 2 or 4. */
  span: number;
  periodsPerYear: number;
  /** Week 53/54/56 payments are always taxed on a non-cumulative basis. */
  forceNonCumulative: boolean;
};

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/** Tax week / month of a payment date: the table "for the week that includes the date of the payment". */
export function taxPeriodFor(params: TaxYearParams, frequency: PayFrequency, payDate: string): TaxPeriod {
  if (frequency === "monthly") {
    const [sy, sm] = params.startDate.split("-").map(Number); // 6 April
    const [y, m, d] = payDate.split("-").map(Number);
    const number = y * 12 + m - (sy * 12 + sm) + (d >= 6 ? 1 : 0);
    return { number, base: 12, span: 1, periodsPerYear: 12, forceNonCumulative: false };
  }
  const week = Math.floor(daysBetween(params.startDate, payDate) / 7) + 1;
  const span = WEEKS_PER_PERIOD[frequency];
  return { number: week, base: 52, span, periodsPerYear: PERIODS_PER_YEAR[frequency], forceNonCumulative: week > 52 };
}

// ---------------------------------------------------------------------------
// Exact integer helpers
// ---------------------------------------------------------------------------

const floorDiv = (a: bigint, b: bigint) => (a >= 0n ? a / b : -((-a + b - 1n) / b));
const ceilDiv = (a: bigint, b: bigint) => -floorDiv(-a, b);
/** Money in units of £0.0001 — the 4 decimal places HMRC's routines work to. */
const U = 10_000n;
const rateBp = (rate: number) => BigInt(Math.round(rate * 10_000)); // 20% → 2000

// ---------------------------------------------------------------------------
// PAYE — HMRC Specification for PAYE Tax Table Routines
// ---------------------------------------------------------------------------

/** Free Pay (suffix codes) or Additional Pay (K codes) for period 1, in pence — spec §4.3.1. */
function periodOneAdjustment(codeNumber: number, base: 52 | 12): bigint {
  if (codeNumber === 0) return 0n;
  // Programmer's method: split into multiples of 500 plus a remainder in 1..500.
  const quotient = BigInt(Math.floor((codeNumber - 1) / 500));
  const remainder = BigInt(((codeNumber - 1) % 500) + 1);
  const annualPounds = remainder * 10n + 9n;
  const valueU = floorDiv(annualPounds * U, BigInt(base)); // to 4dp, no correction
  const valuePence = ceilDiv(valueU, 100n); // round up to 1p
  const perFiveHundred = base === 52 ? 9_616n : 41_667n; // £96.16 / £416.67
  return valuePence + quotient * perFiveHundred;
}

/** Tax due to date (pence) on taxable pay to date — spec §4.4 (Income Tests + Tax Formulae). */
function taxDueToDate(taxablePence: bigint, bands: TaxBands, n: number, base: 52 | 12): bigint {
  if (taxablePence <= 0n) return 0n;
  const nB = BigInt(n);
  const baseB = BigInt(base);
  // Cumulative bandwidths C(i) and cumulative annual tax K(i), K in 4dp units.
  const C: bigint[] = [0n];
  const K: bigint[] = [0n];
  bands.bandwidths.forEach((w, i) => {
    C.push(C[i] + BigInt(w));
    K.push(K[i] + BigInt(w) * rateBp(bands.rates[i])); // £ × bp = 4dp units
  });
  const threshold = (i: number) => floorDiv(C[i] * U * nB, baseB); // c(i), 4dp units, truncated
  const cvalue = (i: number) => ceilDiv(threshold(i), U); // v(i), £ rounded up
  const thresholdTax = (i: number) => floorDiv(K[i] * nB, baseB); // k(i), 4dp units, truncated

  const x = bands.bandwidths.length;
  let formula = x + 1;
  for (let i = 1; i <= x; i++) {
    if (taxablePence <= cvalue(i) * 100n) {
      formula = i;
      break;
    }
  }
  const tn = floorDiv(taxablePence, 100n); // Taxable Pay rounded down to £ — §4.4.4
  const excessU = tn * U - threshold(formula - 1);
  const taxU = thresholdTax(formula - 1) + floorDiv(excessU * rateBp(bands.rates[formula - 1]), U);
  return floorDiv(taxU, 100n); // round down to 1p
}

export type PayeInput = {
  params: TaxYearParams;
  code: ParsedTaxCode;
  period: TaxPeriod;
  /** Taxable pay for this payment (after net-pay pension contributions, including payrolled benefits), pence. */
  payThisPeriod: number;
  /** Payrolled benefits in kind included in payThisPeriod — excluded from the regulatory limit. */
  benefitsThisPeriod?: number;
  /** Taxable pay and tax to date before this payment (this employment plus any P45 figures), pence. */
  payToDate: number;
  taxToDate: number;
};

export type PayeResult = {
  /** Positive = deduction, negative = refund. */
  tax: number;
  cumulative: boolean;
  regulatoryLimitApplied: boolean;
};

export function calculatePaye({ params, code, period, payThisPeriod, payToDate, taxToDate, benefitsThisPeriod = 0 }: PayeInput): PayeResult {
  const bands = params.tax[code.regime];
  const cumulative = !code.nonCumulative && !period.forceNonCumulative;
  // Non-cumulative: each payment in isolation, using the table for the span it covers (§8, §13.5).
  const n = cumulative ? period.number : period.span;
  const pay = BigInt(payThisPeriod);
  const Pn = cumulative ? BigInt(payToDate) + pay : pay;
  const Lprev = cumulative ? BigInt(taxToDate) : 0n;

  let Ln: bigint;
  switch (code.kind) {
    case "NT":
      Ln = 0n;
      break;
    case "BR":
    case "D": {
      const pointer = params.basicRatePointer[code.regime] + (code.kind === "D" ? code.index + 1 : 0);
      const rate = bands.rates[Math.min(pointer, bands.rates.length) - 1];
      const pounds = Pn > 0n ? floorDiv(Pn, 100n) : 0n;
      Ln = floorDiv(pounds * rateBp(rate) * 100n, U); // whole rounded pay at the single rate, to 1p below
      break;
    }
    case "allowance":
    case "K": {
      const adjustment = periodOneAdjustment(code.number, period.base) * BigInt(n);
      const Un = code.kind === "K" ? Pn + adjustment : Pn - adjustment;
      Ln = taxDueToDate(Un, bands, n, period.base);
      break;
    }
  }

  let tax = Ln - Lprev;
  // A payment of NT on a non-cumulative basis never produces a refund (§11).
  if (!cumulative && tax < 0n) tax = 0n;

  // Overriding regulatory limit: never deduct more than 50% of this period's pay (§4.5.2).
  let regulatoryLimitApplied = false;
  const cashPay = pay - BigInt(benefitsThisPeriod);
  const limit = cashPay > 0n ? floorDiv(cashPay * rateBp(params.regulatoryLimit), U) : 0n;
  if (tax > 0n && tax > limit) {
    tax = limit;
    regulatoryLimitApplied = true;
  }
  return { tax: Number(tax), cumulative, regulatoryLimitApplied };
}

// ---------------------------------------------------------------------------
// Class 1 National Insurance — exact percentage method
// ---------------------------------------------------------------------------

/** Rounds a value held in pence × 10,000 to the nearest penny, rounding exact half-pennies down. */
function roundNiPence(value: bigint): number {
  const q = floorDiv(value, U);
  const r = value - q * U;
  return Number(r > 5_000n ? q + 1n : q);
}

export type NiResult = { employee: number; employer: number; niablePay: number };

export function calculateNi(params: TaxYearParams, frequency: PayFrequency, category: NiCategory, grossPence: number): NiResult {
  const t = params.ni;
  const scale = frequency === "monthly" ? 1 : WEEKS_PER_PERIOD[frequency];
  const base = frequency === "monthly" ? t.monthly : t.weekly;
  const { employee, employer } = niOnEarnings(params, category, grossPence, {
    pt: base.pt * scale * 100,
    st: base.st * scale * 100,
    uel: base.uel * scale * 100,
    ust: base.ust * scale * 100,
  });
  return { employee: roundNiPence(employee), employer: roundNiPence(employer), niablePay: Math.max(0, grossPence) };
}

export type NiBands = { atLel: number; lelToPt: number; ptToUel: number };

/**
 * Earnings in each NI band, as reported on the FPS (pence): the LEL itself if earnings
 * reach it, then the slices from LEL to PT and PT to UEL. Directors use the annual
 * thresholds against earnings to date.
 */
export function niBandEarnings(params: TaxYearParams, frequency: PayFrequency | "annual", grossPence: number): NiBands {
  let lel: number, pt: number, uel: number;
  if (frequency === "annual") {
    ({ pt, uel } = annualNiThresholds(params));
    lel = Math.round(params.ni.weekly.lel * 52) * 100;
  } else {
    const scale = frequency === "monthly" ? 1 : WEEKS_PER_PERIOD[frequency];
    const t = frequency === "monthly" ? params.ni.monthly : params.ni.weekly;
    lel = t.lel * scale * 100;
    pt = t.pt * scale * 100;
    uel = t.uel * scale * 100;
  }
  const pay = Math.max(0, grossPence);
  if (pay < lel) return { atLel: 0, lelToPt: 0, ptToUel: 0 };
  return { atLel: lel, lelToPt: Math.min(pay, pt) - lel, ptToUel: pay > pt ? Math.min(pay, uel) - pt : 0 };
}

/** Annual thresholds in pence — used for directors' annual earnings period. */
function annualNiThresholds(params: TaxYearParams) {
  const m = params.ni.monthly;
  const annual = { pt: 12_570, st: 5_000, uel: 50_270, ust: 50_270 };
  // Guard against the monthly table drifting from the annual figures we hold.
  if (m.pt !== 1_048 || m.uel !== 4_189) throw new Error("Annual NI thresholds need updating for this tax year");
  return { pt: annual.pt * 100, st: annual.st * 100, uel: annual.uel * 100, ust: annual.ust * 100 };
}

/**
 * Directors' NI on the annual earnings period, cumulative method: NI due on total
 * earnings so far this tax year against the annual thresholds, less NI already paid.
 * (Assumes the person was a director for the whole tax year.)
 */
export function calculateDirectorNi(
  params: TaxYearParams,
  category: NiCategory,
  niablePayToDate: number,
  employeeNiPaid: number,
  employerNiPaid: number
): { employee: number; employer: number } {
  const due = niOnEarnings(params, category, niablePayToDate, annualNiThresholds(params));
  return { employee: roundNiPence(due.employee) - employeeNiPaid, employer: roundNiPence(due.employer) - employerNiPaid };
}

/** Unrounded NI (pence × 10,000) on earnings against a set of thresholds, by category letter. */
function niOnEarnings(
  params: TaxYearParams,
  category: NiCategory,
  grossPence: number,
  thresholds: { pt: number; st: number; uel: number; ust: number }
): { employee: bigint; employer: bigint } {
  const t = params.ni;
  const pt = BigInt(thresholds.pt);
  const st = BigInt(thresholds.st);
  const uel = BigInt(thresholds.uel);
  const ust = BigInt(thresholds.ust);
  const pay = BigInt(Math.max(0, grossPence));
  const band = (lo: bigint, hi: bigint | null) => {
    const top = hi === null || pay < hi ? pay : hi;
    return top > lo ? top - lo : 0n;
  };

  let ee = 0n;
  let er = 0n;
  const main = rateBp(t.employeeMainRate);
  const add = rateBp(t.employeeAdditionalRate);
  const erRate = rateBp(t.employerRate);
  switch (category) {
    case "A":
    case "H":
    case "M":
    case "V":
      ee = band(pt, uel) * main + band(uel, null) * add;
      break;
    case "B":
      ee = band(pt, uel) * rateBp(t.employeeReducedRate) + band(uel, null) * add;
      break;
    case "J":
    case "Z":
      ee = band(pt, null) * add;
      break;
    case "C":
    case "X":
      ee = 0n;
      break;
  }
  switch (category) {
    case "H":
    case "M":
    case "V":
    case "Z":
      er = band(ust, null) * erRate; // 0% up to the upper secondary threshold
      break;
    case "X":
      er = 0n;
      break;
    default:
      er = band(st, null) * erRate;
  }
  return { employee: ee, employer: er };
}

// ---------------------------------------------------------------------------
// Student & postgraduate loans
// ---------------------------------------------------------------------------

function periodThresholdPence(annual: number, frequency: PayFrequency): bigint {
  // Per-period threshold, truncated to the penny (e.g. Plan 2 monthly £2,448.75).
  if (frequency === "monthly") return floorDiv(BigInt(annual) * 100n, 12n);
  return floorDiv(BigInt(annual) * 100n * BigInt(WEEKS_PER_PERIOD[frequency]), 52n);
}

/** 9% (6% for postgraduate) of NI-able pay above the threshold, rounded down to the whole pound. */
export function calculateStudentLoans(
  params: TaxYearParams,
  frequency: PayFrequency,
  plan: StudentLoanPlan,
  postgrad: boolean,
  niablePence: number
): { studentLoan: number; postgradLoan: number } {
  const s = params.studentLoan;
  const pay = BigInt(niablePence);
  const deduction = (annual: number, rate: number) => {
    const excess = pay - periodThresholdPence(annual, frequency);
    if (excess <= 0n) return 0;
    const pence = floorDiv(excess * rateBp(rate), U);
    return Number(floorDiv(pence, 100n) * 100n);
  };
  const planThreshold = plan ? { "1": s.plan1, "2": s.plan2, "4": s.plan4, "5": s.plan5 }[plan] : null;
  return {
    studentLoan: planThreshold ? deduction(planThreshold, s.rate) : 0,
    postgradLoan: postgrad ? deduction(s.postgrad, s.postgradRate) : 0,
  };
}

// ---------------------------------------------------------------------------
// Workplace pension (auto-enrolment, qualifying earnings basis)
// ---------------------------------------------------------------------------

/** The Pensions Regulator's per-period figures for 2026/27 (lower / upper qualifying earnings, trigger), in £. */
const PENSION_PERIOD_LIMITS: Record<PayFrequency, { lower: number; upper: number; trigger: number }> = {
  weekly: { lower: 120, upper: 967, trigger: 192 },
  fortnightly: { lower: 240, upper: 1_934, trigger: 384 },
  four_weekly: { lower: 480, upper: 3_867, trigger: 768 },
  monthly: { lower: 520, upper: 4_189, trigger: 833 },
};

export function pensionTriggerPence(frequency: PayFrequency): number {
  return PENSION_PERIOD_LIMITS[frequency].trigger * 100;
}

export type PensionResult = {
  qualifyingEarnings: number;
  /** Gross employee contribution (what's credited to the pot from the employee). */
  employeeGross: number;
  /** What comes out of pay: 80% of gross under relief at source, 100% under net pay, nothing under salary sacrifice. */
  employeeDeducted: number;
  employer: number;
};

export function calculatePension(
  frequency: PayFrequency,
  grossPence: number,
  employeePct: number,
  employerPct: number,
  scheme: PensionScheme
): PensionResult {
  const { lower, upper } = PENSION_PERIOD_LIMITS[frequency];
  const qe = Math.max(0, Math.min(grossPence, upper * 100) - lower * 100);
  const pct = (p: number) => Math.round((qe * p) / 100);
  const employeeGross = pct(employeePct);
  return {
    qualifyingEarnings: qe,
    employeeGross,
    employeeDeducted: scheme === "relief_at_source" ? Math.round(employeeGross * 0.8) : scheme === "net_pay" ? employeeGross : 0,
    employer: pct(employerPct),
  };
}

// ---------------------------------------------------------------------------
// A full payslip
// ---------------------------------------------------------------------------

export type PayslipInput = {
  params: TaxYearParams;
  frequency: PayFrequency;
  payDate: string;
  employee: {
    taxCode: string;
    niCategory: NiCategory;
    studentLoanPlan: StudentLoanPlan;
    postgradLoan: boolean;
    pensionEnrolled: boolean;
    pensionEmployeePct: number;
    pensionEmployerPct: number;
    pensionScheme: PensionScheme;
    dateOfBirth: string | null;
    isDirector: boolean;
    niNumber: string | null;
    weeklyHours: number;
    payBasis: "salary" | "hourly";
    hourlyRate: number | null;
  };
  /** Basic pay for the period plus any additions (bonus, overtime…), pence. */
  basicPay: number;
  additions: number;
  hoursWorked: number | null;
  /** Statutory payments (SSP, SMP…) for the period, and contractual pay not paid for absence days, pence. */
  statutoryPay?: number;
  absenceDeduction?: number;
  /** Cash equivalent of benefits in kind payrolled this period, pence. Taxed, never paid out. */
  payrolledBenefits?: number;
  /** Year-to-date before this payment (this tax year, including P45 figures), pence. */
  ytd: { taxablePay: number; tax: number; gross: number; niablePay?: number; employeeNi?: number; employerNi?: number };
  previousNetPay: number | null;
};

export type Payslip = {
  /** Gross pay after any salary sacrifice — the figure tax, NI and loans are based on (plus benefits for tax). */
  gross: number;
  statutoryPay: number;
  absenceDeduction: number;
  salarySacrifice: number;
  payrolledBenefits: number;
  taxablePay: number;
  tax: number;
  employeeNi: number;
  employerNi: number;
  niablePay: number;
  pensionQualifyingEarnings: number;
  employeePension: number;
  employeePensionGross: number;
  employerPension: number;
  studentLoan: number;
  postgradLoan: number;
  net: number;
  taxCodeUsed: string;
  cumulative: boolean;
  period: TaxPeriod;
  flags: PayslipFlag[];
  /** Earnings by NI band this period (for directors: 0 — their bands are worked out on the annual figures). */
  niBands: NiBands;
};

function ageOn(dob: string, onIso: string): number {
  const [by, bm, bd] = dob.split("-").map(Number);
  const [y, m, d] = onIso.split("-").map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function calculatePayslip(input: PayslipInput): Payslip {
  const { params, frequency, payDate, employee: e } = input;
  const flags: PayslipFlag[] = [];
  const period = taxPeriodFor(params, frequency, payDate);
  const statutoryPay = input.statutoryPay ?? 0;
  const absenceDeduction = Math.min(input.absenceDeduction ?? 0, input.basicPay);
  const benefits = input.payrolledBenefits ?? 0;
  // Contractual cash pay before any salary sacrifice.
  const cashGross = input.basicPay - absenceDeduction + input.additions + statutoryPay;

  let code = parseTaxCode(e.taxCode);
  if (!code) {
    flags.push({
      severity: "serious",
      source: "Tax & Statutory",
      tag: "Invalid tax code",
      reason: `"${e.taxCode}" isn't a valid HMRC tax code, so the emergency code ${params.emergencyCode} (non-cumulative) was used. Check the employee's P45 or HMRC coding notice.`,
    });
    code = parseTaxCode(`${params.emergencyCode} X`)!;
  } else if (code.nonCumulative) {
    flags.push({
      severity: "warning",
      source: "Tax & Statutory",
      tag: "Emergency / non-cumulative code",
      reason: `${code.code} is taxed on a Week 1/Month 1 basis — no refunds or catch-up until HMRC issues a cumulative code.`,
    });
  }

  const pension = e.pensionEnrolled
    ? calculatePension(frequency, cashGross, e.pensionEmployeePct, e.pensionEmployerPct, e.pensionScheme)
    : { qualifyingEarnings: 0, employeeGross: 0, employeeDeducted: 0, employer: 0 };
  // Salary sacrifice: the employee gives up that much pay and the employer pays it into the pension instead.
  const salarySacrifice = e.pensionScheme === "salary_sacrifice" ? pension.employeeGross : 0;
  const gross = cashGross - salarySacrifice;
  // Net pay arrangements take the contribution before tax; payrolled benefits are taxed but never paid.
  const taxablePay = gross - (e.pensionScheme === "net_pay" ? pension.employeeDeducted : 0) + benefits;

  const paye = calculatePaye({
    params,
    code,
    period,
    payThisPeriod: taxablePay,
    benefitsThisPeriod: benefits,
    payToDate: input.ytd.taxablePay,
    taxToDate: input.ytd.tax,
  });
  if (paye.regulatoryLimitApplied) {
    flags.push({
      severity: "warning",
      source: "Tax & Statutory",
      tag: "Regulatory limit applied",
      reason: "Tax was capped at 50% of this period's pay; the rest carries forward (cumulative codes) or goes unrecovered this year.",
    });
  }
  if (paye.tax < 0) {
    flags.push({
      severity: "warning",
      source: "Tax & Statutory",
      tag: "Tax refund",
      reason: `A PAYE refund of £${(-paye.tax / 100).toFixed(2)} is due this period under the cumulative code.`,
    });
  }

  let ni = calculateNi(params, frequency, e.niCategory, gross);
  if (e.isDirector) {
    const d = calculateDirectorNi(
      params,
      e.niCategory,
      (input.ytd.niablePay ?? 0) + gross,
      input.ytd.employeeNi ?? 0,
      input.ytd.employerNi ?? 0
    );
    ni = { employee: d.employee, employer: d.employer, niablePay: gross };
    flags.push({
      severity: "warning",
      source: "Tax & Statutory",
      tag: "Director — annual NI",
      reason: "NI is worked out on total earnings this tax year against the annual thresholds (cumulative director method), so it's often nil early in the year and higher later.",
    });
  }
  const loans = calculateStudentLoans(params, frequency, e.studentLoanPlan, e.postgradLoan, ni.niablePay);

  if (!e.niNumber) {
    flags.push({
      severity: "serious",
      source: "Tax & Statutory",
      tag: "Missing NI number",
      reason: "No National Insurance number on file — HMRC needs it on the Full Payment Submission. Ask the employee for it.",
    });
  }

  // National Minimum / Living Wage check on the effective hourly rate.
  const age = e.dateOfBirth ? ageOn(e.dateOfBirth, payDate) : null;
  const nmw = age === null || age >= 21 ? params.minimumWage.age21Plus : age >= 18 ? params.minimumWage.age18to20 : params.minimumWage.under18;
  const hours =
    input.hoursWorked ?? (e.weeklyHours > 0 ? e.weeklyHours * (frequency === "monthly" ? 52 / 12 : WEEKS_PER_PERIOD[frequency]) : 0);
  const nmwPay = input.basicPay - salarySacrifice;
  if (hours > 0 && input.basicPay > 0 && absenceDeduction === 0 && statutoryPay === 0) {
    const effective = nmwPay / 100 / hours;
    if (effective + 1e-9 < nmw) {
      flags.push({
        severity: "critical",
        source: "Compliance",
        tag: "Below minimum wage",
        reason: `Effective rate £${effective.toFixed(2)}/hour is below the £${nmw.toFixed(2)} ${age === null || age >= 21 ? "National Living Wage" : "minimum wage for their age"}. Paying this would breach NMW law.`,
      });
    } else if (effective < nmw * 1.03) {
      flags.push({
        severity: "serious",
        source: "Compliance",
        tag: "NMW proximity",
        reason: `Effective rate £${effective.toFixed(2)}/hour is within 3% of the £${nmw.toFixed(2)} minimum — unpaid overtime or deductions could tip it under.`,
      });
    }
  }
  if (age === null && e.pensionEnrolled === false && gross >= pensionTriggerPence(frequency)) {
    flags.push({
      severity: "warning",
      source: "Compliance",
      tag: "Auto-enrolment check",
      reason: "Earnings are above the auto-enrolment trigger but the employee isn't in the pension. Add their date of birth to confirm eligibility, or record their opt-out.",
    });
  }

  const net = gross - paye.tax - ni.employee - pension.employeeDeducted - loans.studentLoan - loans.postgradLoan;
  const employerPension = pension.employer + salarySacrifice;
  if (input.previousNetPay && input.previousNetPay > 0) {
    const delta = (net - input.previousNetPay) / input.previousNetPay;
    if (Math.abs(delta) >= 0.2) {
      flags.push({
        severity: "warning",
        source: "Commission & Variable Pay",
        tag: "Pay variance",
        reason: `Net pay is ${delta > 0 ? "up" : "down"} ${Math.round(Math.abs(delta) * 100)}% on the last period — check any bonus, hours or deduction changes are expected.`,
      });
    }
  }
  if (net < 0) {
    flags.push({
      severity: "critical",
      source: "Bank & Payments",
      tag: "Negative net pay",
      reason: "Deductions exceed gross pay this period — adjust the pay or deductions before approving.",
    });
  }

  return {
    gross,
    statutoryPay,
    absenceDeduction,
    salarySacrifice,
    payrolledBenefits: benefits,
    taxablePay,
    tax: paye.tax,
    employeeNi: ni.employee,
    employerNi: ni.employer,
    niablePay: ni.niablePay,
    pensionQualifyingEarnings: pension.qualifyingEarnings,
    employeePension: pension.employeeDeducted,
    employeePensionGross: pension.employeeGross,
    employerPension,
    studentLoan: loans.studentLoan,
    postgradLoan: loans.postgradLoan,
    net,
    taxCodeUsed: code.code,
    cumulative: paye.cumulative,
    period,
    flags,
    niBands: e.isDirector || ["X"].includes(e.niCategory) ? { atLel: 0, lelToPt: 0, ptToUel: 0 } : niBandEarnings(params, frequency, gross),
  };
}

/** Basic pay for one period from an annual salary or an hourly rate, pence. */
export function basicPayForPeriod(
  frequency: PayFrequency,
  basis: "salary" | "hourly",
  annualSalary: number | null,
  hourlyRate: number | null,
  hoursWorked: number | null
): number {
  if (basis === "hourly") return Math.round((hourlyRate ?? 0) * (hoursWorked ?? 0) * 100);
  return Math.round(((annualSalary ?? 0) * 100) / PERIODS_PER_YEAR[frequency]);
}

/** Contracted hours in one period, for hourly staff with no timesheet entry yet. */
export function contractedHoursForPeriod(frequency: PayFrequency, weeklyHours: number): number {
  const weeks = frequency === "monthly" ? 52 / 12 : WEEKS_PER_PERIOD[frequency];
  return Math.round(weeklyHours * weeks * 100) / 100;
}
