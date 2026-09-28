/**
 * UK payroll parameters for the 2026/27 tax year (6 April 2026 – 5 April 2027).
 *
 * Sources:
 *  - HMRC "Specification for PAYE Tax Table Routines" v24.0 (Feb 2026), Appendices A–C
 *  - GOV.UK "Rates and thresholds for employers 2026 to 2027"
 *  - DWP review of the auto-enrolment earnings trigger and qualifying earnings band 2026/27
 *
 * Add a new entry per tax year rather than editing figures in place — a run in April
 * must be calculated on that year's figures even after the next year's are published.
 */

export type TaxRegime = "rUK" | "scotland" | "wales";

/** Rates and bandwidths in the HMRC spec's shape: R[i] applies to band B[i]; the last rate is unbounded. */
export type TaxBands = { rates: number[]; bandwidths: number[] };

export type TaxYearParams = {
  label: string; // "2026-27"
  startDate: string; // YYYY-MM-DD (6 April)
  tax: Record<TaxRegime, TaxBands>;
  /** Gpointer: 1-based index of the basic rate (used by BR and D codes). */
  basicRatePointer: Record<TaxRegime, number>;
  /** Overriding regulatory limit: max tax deductible as a share of the period's pay. */
  regulatoryLimit: number;
  emergencyCode: string;
  ni: {
    weekly: NiThresholds;
    monthly: NiThresholds;
    employeeMainRate: number;
    employeeReducedRate: number; // category B/E/I (married women's reduced rate)
    employeeAdditionalRate: number; // above UEL
    employerRate: number;
  };
  employmentAllowance: number;
  studentLoan: {
    plan1: number;
    plan2: number;
    plan4: number;
    plan5: number;
    postgrad: number;
    rate: number;
    postgradRate: number;
  };
  autoEnrolment: {
    trigger: number; // annual earnings trigger for automatic enrolment
    qualifyingLower: number; // annual
    qualifyingUpper: number; // annual
    minTotalPct: number;
    minEmployerPct: number;
  };
  /** National Minimum / Living Wage from 1 April. */
  minimumWage: { age21Plus: number; age18to20: number; under18: number; apprentice: number };
  statutory: {
    /** SSP: the lower of this weekly rate or a share of average weekly earnings; payable from the first day of sickness. */
    sspWeekly: number;
    sspShareOfAwe: number;
    sspMaxWeeks: number;
    /** Flat weekly rate for SMP (after week 6), SAP, SPP, ShPP, SPBP and SNCP — or 90% of AWE if lower. */
    flatWeekly: number;
    /** Weekly lower earnings limit: family-related statutory pay needs AWE at or above this. */
    lowerEarningsLimitWeekly: number;
    /** Employers recover this share of SMP/SAP/SPP/ShPP/SPBP/SNCP through the EPS… */
    recoveryRate: number;
    /** …or this share with Small Employers' Relief (Class 1 NI of no more than the threshold last tax year). */
    smallEmployerRecoveryRate: number;
    smallEmployerThreshold: number;
  };
};

type NiThresholds = { lel: number; pt: number; st: number; uel: number; ust: number };

export const TAX_YEAR_2026_27: TaxYearParams = {
  label: "2026-27",
  startDate: "2026-04-06",
  tax: {
    // Appendix A — England & Northern Ireland. B1 = 0 (the 10% starting-rate band is unused).
    rUK: { rates: [0.1, 0.2, 0.4, 0.45], bandwidths: [0, 37_700, 87_440] },
    // Appendix B — Scotland (subject to parliamentary approval at time of issue).
    scotland: { rates: [0.19, 0.2, 0.21, 0.42, 0.45, 0.48], bandwidths: [3_967, 12_989, 14_136, 31_338, 62_710] },
    // Appendix C — Wales (same bands as rUK).
    wales: { rates: [0.1, 0.2, 0.4, 0.45], bandwidths: [0, 37_700, 87_440] },
  },
  basicRatePointer: { rUK: 2, scotland: 2, wales: 2 },
  regulatoryLimit: 0.5,
  emergencyCode: "1257L",
  ni: {
    weekly: { lel: 129, pt: 242, st: 96, uel: 967, ust: 967 },
    monthly: { lel: 559, pt: 1_048, st: 417, uel: 4_189, ust: 4_189 },
    employeeMainRate: 0.08,
    employeeReducedRate: 0.0185,
    employeeAdditionalRate: 0.02,
    employerRate: 0.15,
  },
  employmentAllowance: 10_500,
  studentLoan: { plan1: 26_900, plan2: 29_385, plan4: 33_795, plan5: 25_000, postgrad: 21_000, rate: 0.09, postgradRate: 0.06 },
  autoEnrolment: { trigger: 10_000, qualifyingLower: 6_240, qualifyingUpper: 50_270, minTotalPct: 8, minEmployerPct: 3 },
  minimumWage: { age21Plus: 12.71, age18to20: 10.85, under18: 8, apprentice: 8 },
  statutory: {
    sspWeekly: 123.25,
    sspShareOfAwe: 0.8,
    sspMaxWeeks: 28,
    flatWeekly: 194.32,
    lowerEarningsLimitWeekly: 129,
    recoveryRate: 0.92,
    smallEmployerRecoveryRate: 1.09,
    smallEmployerThreshold: 45_000,
  },
};

const TAX_YEARS = [TAX_YEAR_2026_27];

/** The tax year a payment date falls in. Throws for years we don't hold figures for yet. */
export function taxYearFor(payDate: string): TaxYearParams {
  const year = [...TAX_YEARS].reverse().find((y) => payDate >= y.startDate);
  if (!year) throw new Error(`No payroll rates configured for a payment on ${payDate}`);
  const next = new Date(year.startDate);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  if (payDate >= next.toISOString().slice(0, 10)) {
    throw new Error(`Payroll rates for the tax year starting ${next.toISOString().slice(0, 10)} aren't configured yet`);
  }
  return year;
}
