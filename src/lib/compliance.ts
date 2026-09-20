import type { Employee, PayrollLine } from "./queries";

/**
 * These are illustrative, deterministic approximations for the purposes of the demo —
 * not real tax/NI calculations. The site is explicit everywhere else that figures are
 * illustrative; this keeps that promise for the compliance-facing numbers too.
 */

export const NMW_HOURLY_RATE = 12.71; // National Living Wage, 21+, matches the rate already cited in the marketing copy.
const REFERENCE_DATE = new Date("2026-09-15"); // mid-period date used for "weeks employed" style calculations.

/** Rough reverse-tax approximation: net pay -> estimated gross pay, assuming a typical basic-rate PAYE employee. */
export function estimateGrossFromNet(net: number): number {
  return net / 0.76;
}

export function monthlyHours(weeklyHours: number): number {
  return (weeklyHours * 52) / 12;
}

export function effectiveHourlyRate(employee: Employee, line: PayrollLine): number {
  const gross = estimateGrossFromNet(line.net_pay);
  return gross / monthlyHours(employee.weekly_hours);
}

export function nmwCheck(employee: Employee, line: PayrollLine): { pass: boolean; rate: number; floor: number } {
  const rate = effectiveHourlyRate(employee, line);
  return { pass: rate >= NMW_HOURLY_RATE, rate, floor: NMW_HOURLY_RATE };
}

function parseStartDate(startDate: string): Date {
  // e.g. "3 Apr 2023"
  const parsed = new Date(startDate);
  return isNaN(parsed.getTime()) ? REFERENCE_DATE : parsed;
}

export function weeksEmployed(employee: Employee): number {
  const start = parseStartDate(employee.start_date);
  const ms = REFERENCE_DATE.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (7 * 24 * 60 * 60 * 1000)));
}

export type StatutoryEligibility = {
  ssp: { eligible: boolean; note: string };
  familyLeave: { eligible: boolean; note: string }; // SMP/SPP/SAP/ShPP share the same 26-week continuous-employment qualifying rule
  ir35: { status: string; note: string };
};

export type ComplianceException = {
  employeeId: string;
  employeeName: string;
  kind: "nmw" | "family-leave";
  detail: string;
};

/**
 * The Compliance Agent's core routine: run the NMW check and the statutory
 * family-leave qualifying check across every employee against their current
 * payroll line (where one exists), and return only the exceptions — the
 * employees who need a human to look at something before the run is signed
 * off. This is the same nmwCheck/statutoryEligibility math already used on
 * each employee's own detail page, just swept across the whole workforce in
 * one pass instead of one page at a time.
 */
export function complianceSweep(
  employees: Employee[],
  lineByEmployeeId: Map<string, PayrollLine>
): ComplianceException[] {
  const exceptions: ComplianceException[] = [];
  for (const employee of employees) {
    const line = lineByEmployeeId.get(employee.id);
    if (line) {
      const nmw = nmwCheck(employee, line);
      if (!nmw.pass) {
        exceptions.push({
          employeeId: employee.id,
          employeeName: employee.name,
          kind: "nmw",
          detail: `Effective hourly rate £${nmw.rate.toFixed(2)} is below the £${nmw.floor.toFixed(2)} NMW floor.`,
        });
      }
    }
    const family = statutoryEligibility(employee);
    if (!family.familyLeave.eligible) {
      exceptions.push({
        employeeId: employee.id,
        employeeName: employee.name,
        kind: "family-leave",
        detail: family.familyLeave.note,
      });
    }
  }
  return exceptions;
}

export function statutoryEligibility(employee: Employee): StatutoryEligibility {
  const weeks = weeksEmployed(employee);
  const qualifies = weeks >= 26;
  return {
    ssp: {
      eligible: true,
      note: "Eligible from day one of qualifying sickness, subject to average weekly earnings above the Lower Earnings Limit.",
    },
    familyLeave: {
      eligible: qualifies,
      note: qualifies
        ? `Qualifies for SMP/SPP/SAP/ShPP — ${weeks} weeks' continuous employment (26 required by the qualifying week).`
        : `Not yet qualifying for SMP/SPP/SAP/ShPP — ${weeks} of the required 26 weeks' continuous employment.`,
    },
    ir35: {
      status: "N/A",
      note: "PAYE employee, not an off-payroll contractor — IR35 status determination doesn't apply.",
    },
  };
}
