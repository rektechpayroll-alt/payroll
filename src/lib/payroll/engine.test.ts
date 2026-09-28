import { describe, expect, it } from "vitest";
import { TAX_YEAR_2026_27 as Y, taxYearFor } from "./rates";
import { parseTaxCode } from "./taxcode";
import {
  calculateDirectorNi,
  calculateNi,
  calculatePaye,
  calculatePayslip,
  calculatePension,
  calculateStudentLoans,
  taxPeriodFor,
  type PayslipInput,
} from "./engine";

// Expected figures are worked by hand from HMRC's "Specification for PAYE Tax Table
// Routines" v24.0 and the 2026/27 rates — see the comment on each case.

const gbp = (pounds: number) => Math.round(pounds * 100);

function paye(code: string, freq: "monthly" | "weekly" | "fortnightly", payDate: string, pay: number, ytdPay = 0, ytdTax = 0) {
  return calculatePaye({
    params: Y,
    code: parseTaxCode(code)!,
    period: taxPeriodFor(Y, freq, payDate),
    payThisPeriod: gbp(pay),
    payToDate: gbp(ytdPay),
    taxToDate: gbp(ytdTax),
  });
}

describe("tax periods", () => {
  it("maps pay dates to tax months (6th to 5th)", () => {
    expect(taxPeriodFor(Y, "monthly", "2026-04-30").number).toBe(1);
    expect(taxPeriodFor(Y, "monthly", "2026-05-05").number).toBe(1);
    expect(taxPeriodFor(Y, "monthly", "2026-05-06").number).toBe(2);
    expect(taxPeriodFor(Y, "monthly", "2026-09-30").number).toBe(6);
    expect(taxPeriodFor(Y, "monthly", "2027-04-05").number).toBe(12);
  });
  it("maps pay dates to tax weeks", () => {
    expect(taxPeriodFor(Y, "weekly", "2026-04-06").number).toBe(1);
    expect(taxPeriodFor(Y, "weekly", "2026-04-12").number).toBe(1);
    expect(taxPeriodFor(Y, "weekly", "2026-04-13").number).toBe(2);
    expect(taxPeriodFor(Y, "weekly", "2027-04-05").forceNonCumulative).toBe(true); // week 53
  });
  it("refuses tax years without configured rates", () => {
    expect(() => taxYearFor("2027-04-06")).toThrow();
    expect(taxYearFor("2026-04-06").label).toBe("2026-27");
  });
});

describe("tax codes", () => {
  it("parses prefixes, codes and non-cumulative suffixes", () => {
    expect(parseTaxCode("1257L")).toMatchObject({ kind: "allowance", regime: "rUK", number: 1257, nonCumulative: false });
    expect(parseTaxCode("S1257L")).toMatchObject({ kind: "allowance", regime: "scotland" });
    expect(parseTaxCode("C1257L")).toMatchObject({ kind: "allowance", regime: "wales" });
    expect(parseTaxCode("1257L M1")).toMatchObject({ nonCumulative: true });
    expect(parseTaxCode("1257LX")).toMatchObject({ nonCumulative: true });
    expect(parseTaxCode("K475")).toMatchObject({ kind: "K", number: 475 });
    expect(parseTaxCode("SD1")).toMatchObject({ kind: "D", regime: "scotland", index: 1 });
    expect(parseTaxCode("BR")).toMatchObject({ kind: "BR" });
    expect(parseTaxCode("0T")).toMatchObject({ kind: "allowance", number: 0 });
    expect(parseTaxCode("NT")).toMatchObject({ kind: "NT" });
    expect(parseTaxCode("hello")).toBeNull();
    expect(parseTaxCode("")).toBeNull();
  });
});

describe("PAYE", () => {
  it("1257L, £3,000 month 1 → £390.20", () => {
    // Free pay M1 = ceil((1257×10+9)/12) = £1,048.25; taxable £1,951.75 → £1,951 × 20%
    expect(paye("1257L", "monthly", "2026-04-30", 3000).tax).toBe(gbp(390.2));
  });
  it("is cumulative: month 2 catches up the rounding → £390.40", () => {
    // Free pay £2,096.50; taxable £3,903.50 → £3,903 × 20% = £780.60, less £390.20 paid
    expect(paye("1257L", "monthly", "2026-05-29", 3000, 3000, 390.2).tax).toBe(gbp(390.4));
  });
  it("higher rate: £5,000 month 1 → £952.06", () => {
    // k2 = 7540/12 = 628.3333; c2 = 3141.6666; (3951 − 3141.6666) × 40% = 323.7333 → 952.0666
    expect(paye("1257L", "monthly", "2026-04-30", 5000).tax).toBe(gbp(952.06));
  });
  it("0T taxes everything from the first pound", () => {
    expect(paye("0T", "monthly", "2026-04-30", 3000).tax).toBe(gbp(600));
  });
  it("BR, D0 and D1 tax the whole rounded pay at a flat rate", () => {
    expect(paye("BR", "monthly", "2026-04-30", 1234.56).tax).toBe(gbp(246.8));
    expect(paye("D0", "monthly", "2026-04-30", 1234.56).tax).toBe(gbp(493.6));
    expect(paye("D1", "monthly", "2026-04-30", 1234.56).tax).toBe(gbp(555.3));
  });
  it("NT deducts nothing", () => {
    expect(paye("NT", "monthly", "2026-04-30", 9000).tax).toBe(0);
  });
  it("K codes add pay: K475, £2,000 → £479.20", () => {
    // Additional pay = ceil(4759/12) = £396.59; taxable £2,396.59 → £2,396 × 20%
    expect(paye("K475", "monthly", "2026-04-30", 2000).tax).toBe(gbp(479.2));
  });
  it("caps tax at 50% of pay (regulatory limit)", () => {
    // K1000: £416.67 + ceil(5009/12)=£417.42 → taxable £1,334.09 → £266.80, capped at £250
    const r = paye("K1000", "monthly", "2026-04-30", 500);
    expect(r.tax).toBe(gbp(250));
    expect(r.regulatoryLimitApplied).toBe(true);
  });
  it("Scottish S1257L, £3,000 month 1 → £392.27", () => {
    // Intermediate band: Sk2 = 3351.53/12 = 279.2941; + (1951 − 1413) × 21% = 112.98
    expect(paye("S1257L", "monthly", "2026-04-30", 3000).tax).toBe(gbp(392.27));
  });
  it("Month 1 basis ignores year-to-date figures", () => {
    expect(paye("1257L M1", "monthly", "2026-09-30", 3000, 50_000, 9_000).tax).toBe(gbp(390.2));
  });
  it("weekly: 1257L, £600 week 1 → £71.60", () => {
    // Free pay W1 = ceil(12579/52) = £241.91; taxable £358.09 → £358 × 20%
    expect(paye("1257L", "weekly", "2026-04-10", 600).tax).toBe(gbp(71.6));
  });
  it("fortnightly uses the week-2 table: £1,200 → £143.20", () => {
    expect(paye("1257L", "fortnightly", "2026-04-17", 1200).tax).toBe(gbp(143.2));
  });
  it("refunds under a cumulative code when pay drops", () => {
    // Month 2, no pay: free pay £2,096.50 against £3,000 to date → £903 × 20% = £180.60 due; £390.20 paid
    expect(paye("1257L", "monthly", "2026-05-29", 0, 3000, 390.2).tax).toBe(-gbp(209.6));
  });
});

describe("National Insurance", () => {
  it("category A monthly £3,000 → employee £156.16, employer £387.45", () => {
    expect(calculateNi(Y, "monthly", "A", gbp(3000))).toMatchObject({ employee: gbp(156.16), employer: gbp(387.45) });
  });
  it("above the UEL: £5,000 → employee £267.50, employer £687.45", () => {
    // (4189 − 1048) × 8% = 251.28 + (5000 − 4189) × 2% = 16.22
    expect(calculateNi(Y, "monthly", "A", gbp(5000))).toMatchObject({ employee: gbp(267.5), employer: gbp(687.45) });
  });
  it("rounds exact half-pennies down", () => {
    // 25p above the UEL at 2% = 0.5p → 251.28, not 251.29
    expect(calculateNi(Y, "monthly", "A", gbp(4189.25)).employee).toBe(gbp(251.28));
  });
  it("weekly and fortnightly thresholds scale", () => {
    expect(calculateNi(Y, "weekly", "A", gbp(600))).toMatchObject({ employee: gbp(28.64), employer: gbp(75.6) });
    expect(calculateNi(Y, "fortnightly", "A", gbp(1200)).employee).toBe(gbp(57.28));
  });
  it("under-21 (M) has no employer NI below the UST", () => {
    expect(calculateNi(Y, "monthly", "M", gbp(3000))).toMatchObject({ employee: gbp(156.16), employer: 0 });
  });
  it("over State Pension age (C) has no employee NI", () => {
    expect(calculateNi(Y, "monthly", "C", gbp(3000))).toMatchObject({ employee: 0, employer: gbp(387.45) });
  });
  it("below the primary threshold nothing is due from the employee", () => {
    expect(calculateNi(Y, "monthly", "A", gbp(1000)).employee).toBe(0);
  });
});

describe("student loans", () => {
  it("Plan 2 at £3,000/month → £49 (rounded down to £)", () => {
    // (3000 − 2448.75) × 9% = 49.61
    expect(calculateStudentLoans(Y, "monthly", "2", false, gbp(3000)).studentLoan).toBe(gbp(49));
  });
  it("Plan 1 and postgraduate", () => {
    // Plan 1: (3000 − 2241.66) × 9% = 68.25 → £68. PGL: (3000 − 1750) × 6% = £75
    expect(calculateStudentLoans(Y, "monthly", "1", true, gbp(3000))).toEqual({ studentLoan: gbp(68), postgradLoan: gbp(75) });
  });
  it("nothing below the threshold", () => {
    expect(calculateStudentLoans(Y, "monthly", "4", false, gbp(2500)).studentLoan).toBe(0);
  });
});

describe("pension (qualifying earnings)", () => {
  it("relief at source: 5% / 3% of £2,480 qualifying earnings", () => {
    expect(calculatePension("monthly", gbp(3000), 5, 3, "relief_at_source")).toEqual({
      qualifyingEarnings: gbp(2480),
      employeeGross: gbp(124),
      employeeDeducted: gbp(99.2),
      employer: gbp(74.4),
    });
  });
  it("net pay arrangement deducts the full contribution", () => {
    expect(calculatePension("monthly", gbp(3000), 5, 3, "net_pay").employeeDeducted).toBe(gbp(124));
  });
  it("caps qualifying earnings at the upper limit", () => {
    expect(calculatePension("monthly", gbp(9000), 5, 3, "relief_at_source").qualifyingEarnings).toBe(gbp(4189 - 520));
  });
});

describe("full payslip", () => {
  const base: PayslipInput = {
    params: Y,
    frequency: "monthly",
    payDate: "2026-04-30",
    employee: {
      taxCode: "1257L",
      niCategory: "A",
      studentLoanPlan: null,
      postgradLoan: false,
      pensionEnrolled: true,
      pensionEmployeePct: 5,
      pensionEmployerPct: 3,
      pensionScheme: "relief_at_source",
      dateOfBirth: "1990-01-01",
      isDirector: false,
      niNumber: "QQ123456C",
      weeklyHours: 37.5,
      payBasis: "salary",
      hourlyRate: null,
    },
    basicPay: gbp(3000),
    additions: 0,
    hoursWorked: null,
    ytd: { taxablePay: 0, tax: 0, gross: 0 },
    previousNetPay: null,
  };

  it("£36k salary, month 1: net £2,354.44", () => {
    const p = calculatePayslip(base);
    // 3000 − 390.20 tax − 156.16 NI − 99.20 pension
    expect(p).toMatchObject({ tax: gbp(390.2), employeeNi: gbp(156.16), employeePension: gbp(99.2), net: gbp(2354.44), employerPension: gbp(74.4) });
    expect(p.flags).toEqual([]);
  });

  it("net pay pension reduces taxable pay", () => {
    const p = calculatePayslip({ ...base, employee: { ...base.employee, pensionScheme: "net_pay" } });
    // Taxable £2,876 − £1,048.25 = £1,827.75 → £1,827 × 20% = £365.40
    expect(p.taxablePay).toBe(gbp(2876));
    expect(p.tax).toBe(gbp(365.4));
  });

  it("flags pay below the National Living Wage as blocking", () => {
    const p = calculatePayslip({ ...base, basicPay: gbp(1500) }); // £1,500 / 162.5h = £9.23/h
    expect(p.flags.map((f) => [f.severity, f.tag])).toContainEqual(["critical", "Below minimum wage"]);
  });

  it("flags a missing NI number and an invalid tax code", () => {
    const p = calculatePayslip({ ...base, employee: { ...base.employee, niNumber: null, taxCode: "XYZ" } });
    const tags = p.flags.map((f) => f.tag);
    expect(tags).toContain("Missing NI number");
    expect(tags).toContain("Invalid tax code");
    expect(p.tax).toBe(gbp(390.2)); // emergency 1257L on a non-cumulative basis
  });

  it("salary sacrifice reduces pay before tax and NI", () => {
    const p = calculatePayslip({ ...base, employee: { ...base.employee, pensionScheme: "salary_sacrifice" } });
    // 5% of £2,480 QE = £124 sacrificed → £2,876 gross. Tax: £1,827 × 20% = £365.40.
    // NI: (2876 − 1048) × 8% = £146.24; employer (2876 − 417) × 15% = £368.85
    expect(p).toMatchObject({
      salarySacrifice: gbp(124),
      gross: gbp(2876),
      tax: gbp(365.4),
      employeeNi: gbp(146.24),
      employerNi: gbp(368.85),
      employeePension: 0,
      employerPension: gbp(198.4),
      net: gbp(2364.36),
    });
  });

  it("payrolled benefits are taxed but not paid or NI'd", () => {
    const p = calculatePayslip({ ...base, payrolledBenefits: gbp(100) });
    // Taxable £3,100 − £1,048.25 → £2,051 × 20% = £410.20; NI unchanged
    expect(p).toMatchObject({ tax: gbp(410.2), employeeNi: gbp(156.16), net: gbp(3000 - 410.2 - 156.16 - 99.2) });
  });

  it("statutory pay and absence deductions flow into gross", () => {
    const p = calculatePayslip({ ...base, absenceDeduction: gbp(500), statutoryPay: gbp(123.25) });
    expect(p.gross).toBe(gbp(3000 - 500 + 123.25));
    expect(p.flags.map((f) => f.tag)).not.toContain("Below minimum wage");
  });

  it("directors pay NI on the annual earnings period", () => {
    const month1 = calculatePayslip({ ...base, employee: { ...base.employee, isDirector: true }, basicPay: gbp(5000) });
    // £5,000 to date is under both annual thresholds' charging points for the employee; employer ST is £5,000
    expect(month1).toMatchObject({ employeeNi: 0, employerNi: 0 });
    expect(month1.flags.map((f) => f.tag)).toContain("Director — annual NI");
  });
});

describe("directors' NI (annual earnings period)", () => {
  it("month 3: £15,000 to date → employee £194.40, employer £750 this period", () => {
    // Employee: (15,000 − 12,570) × 8% = 194.40. Employer: (15,000 − 5,000) × 15% = 1,500 less 750 paid.
    expect(calculateDirectorNi(Y, "A", gbp(15000), 0, gbp(750))).toEqual({ employee: gbp(194.4), employer: gbp(750) });
  });
  it("above the annual UEL", () => {
    // (50,270 − 12,570) × 8% = 3,016 + (60,000 − 50,270) × 2% = 194.60
    expect(calculateDirectorNi(Y, "A", gbp(60000), 0, 0).employee).toBe(gbp(3210.6));
  });
});

import { niBandEarnings } from "./engine";

describe("NI band earnings (FPS)", () => {
  it("monthly £3,000: LEL £559, LEL→PT £489, PT→UEL £1,952", () => {
    expect(niBandEarnings(Y, "monthly", gbp(3000))).toEqual({ atLel: gbp(559), lelToPt: gbp(489), ptToUel: gbp(1952) });
  });
  it("below the LEL reports nothing", () => {
    expect(niBandEarnings(Y, "monthly", gbp(500))).toEqual({ atLel: 0, lelToPt: 0, ptToUel: 0 });
  });
  it("above the UEL caps the top band", () => {
    expect(niBandEarnings(Y, "monthly", gbp(6000)).ptToUel).toBe(gbp(4189 - 1048));
  });
  it("directors: annual thresholds", () => {
    expect(niBandEarnings(Y, "annual", gbp(15000))).toEqual({ atLel: gbp(6708), lelToPt: gbp(12570 - 6708), ptToUel: gbp(15000 - 12570) });
  });
});

