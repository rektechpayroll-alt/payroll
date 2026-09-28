import type { TaxYearParams } from "./rates";

/**
 * Statutory payments for absences — Statutory Sick Pay and the family-related payments
 * (maternity, adoption, paternity, shared parental, parental bereavement, neonatal care).
 * Pure functions over dates; money in pence. Rules as at 2026/27:
 *  - SSP is paid from the first qualifying day of sickness (no waiting days, no earnings
 *    threshold) at the lower of £123.25/week or 80% of AWE, for up to 28 weeks.
 *  - SMP/SAP: 6 weeks at 90% of AWE, then 33 weeks at the lower of the flat rate or 90%.
 *  - SPP/SPBP 2 weeks, SNCP 12 weeks, ShPP up to 37 weeks — all at the lower rate.
 *  - Family payments need AWE of at least the lower earnings limit.
 * Weekly rates that aren't whole pence are rounded up, as are part-week totals.
 */

export type AbsenceType = "sickness" | "maternity" | "adoption" | "paternity" | "shared_parental" | "parental_bereavement" | "neonatal_care";

export const ABSENCE_TYPES: Record<AbsenceType, { label: string; payment: string; recoverable: boolean }> = {
  sickness: { label: "Sickness", payment: "SSP", recoverable: false },
  maternity: { label: "Maternity leave", payment: "SMP", recoverable: true },
  adoption: { label: "Adoption leave", payment: "SAP", recoverable: true },
  paternity: { label: "Paternity leave", payment: "SPP", recoverable: true },
  shared_parental: { label: "Shared parental leave", payment: "ShPP", recoverable: true },
  parental_bereavement: { label: "Parental bereavement leave", payment: "SPBP", recoverable: true },
  neonatal_care: { label: "Neonatal care leave", payment: "SNCP", recoverable: true },
};

/** Weeks of payment, and how many of them are at the 90%-of-AWE higher rate. */
const PAYMENT_WEEKS: Record<Exclude<AbsenceType, "sickness">, { weeks: number; higherRateWeeks: number }> = {
  maternity: { weeks: 39, higherRateWeeks: 6 },
  adoption: { weeks: 39, higherRateWeeks: 6 },
  paternity: { weeks: 2, higherRateWeeks: 0 },
  shared_parental: { weeks: 37, higherRateWeeks: 0 },
  parental_bereavement: { weeks: 2, higherRateWeeks: 0 },
  neonatal_care: { weeks: 12, higherRateWeeks: 0 },
};

export type Absence = {
  type: AbsenceType;
  startDate: string; // YYYY-MM-DD, first day of absence / payment period
  endDate: string; // YYYY-MM-DD inclusive
  /** Average weekly earnings over the relevant period, £. */
  averageWeeklyEarnings: number;
  /** Days of the week the employee normally works (0 = Sunday … 6 = Saturday) — SSP's qualifying days. */
  qualifyingDays: number[];
};

export type StatutoryResult = {
  amount: number; // pence
  days: number;
  eligible: boolean;
  note: string | null;
};

const DAY_MS = 86_400_000;
const toDay = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const weekday = (day: number) => new Date(day * DAY_MS).getUTCDay();

/** Weekly rate in pence, rounded up to the whole penny. */
const weeklyPence = (pounds: number) => Math.ceil(Math.round(pounds * 100_000) / 1000);

export function statutoryPayForPeriod(params: TaxYearParams, absence: Absence, periodStart: string, periodEnd: string): StatutoryResult {
  const s = params.statutory;
  const first = Math.max(toDay(absence.startDate), toDay(periodStart));
  const last = Math.min(toDay(absence.endDate), toDay(periodEnd));
  if (last < first) return { amount: 0, days: 0, eligible: true, note: null };
  const absenceStart = toDay(absence.startDate);

  if (absence.type === "sickness") {
    const qd = absence.qualifyingDays.length;
    if (!qd) return { amount: 0, days: 0, eligible: false, note: "No qualifying days set — add the employee's usual working days." };
    const weekly = Math.min(weeklyPence(s.sspWeekly), weeklyPence(absence.averageWeeklyEarnings * s.sspShareOfAwe));
    const maxDays = s.sspMaxWeeks * qd;
    let before = 0; // qualifying days already paid in this spell before the period
    for (let d = absenceStart; d < first; d++) if (absence.qualifyingDays.includes(weekday(d))) before++;
    let days = 0;
    for (let d = first; d <= last; d++) {
      if (absence.qualifyingDays.includes(weekday(d)) && before + days < maxDays) days++;
    }
    const note = before + days >= maxDays ? `SSP ends after ${s.sspMaxWeeks} weeks — issue form SSP1.` : null;
    return { amount: Math.ceil((weekly * days) / qd), days, eligible: true, note };
  }

  if (absence.averageWeeklyEarnings < s.lowerEarningsLimitWeekly) {
    return {
      amount: 0,
      days: 0,
      eligible: false,
      note: `Average weekly earnings of £${absence.averageWeeklyEarnings.toFixed(2)} are below the £${s.lowerEarningsLimitWeekly} lower earnings limit, so ${ABSENCE_TYPES[absence.type].payment} isn't payable — give the employee the relevant exclusion form (e.g. SMP1).`,
    };
  }
  const { weeks, higherRateWeeks } = PAYMENT_WEEKS[absence.type];
  const higher = weeklyPence(absence.averageWeeklyEarnings * 0.9);
  const lower = Math.min(weeklyPence(s.flatWeekly), higher);
  let sevenths = 0; // total in units of pence/7 — paid for every calendar day at weekly ÷ 7
  let days = 0;
  for (let d = first; d <= last; d++) {
    const week = Math.floor((d - absenceStart) / 7);
    if (week >= weeks) break;
    sevenths += week < higherRateWeeks ? higher : lower;
    days++;
  }
  const lastPaidDay = absenceStart + weeks * 7 - 1;
  const note = last >= lastPaidDay && toDay(absence.endDate) > lastPaidDay ? `${ABSENCE_TYPES[absence.type].payment} ends after ${weeks} weeks.` : null;
  return { amount: Math.ceil(sevenths / 7), days, eligible: true, note };
}

/** Working days in [from, to] on the given weekdays — for docking contractual pay during absence. */
export function workingDaysBetween(from: string, to: string, workingDays: number[]): number {
  let n = 0;
  for (let d = toDay(from); d <= toDay(to); d++) if (workingDays.includes(weekday(d))) n++;
  return n;
}

/** What an employer recovers from HMRC on the EPS for family-related statutory pay (never SSP), pence. */
export function recoverableAmount(params: TaxYearParams, recoverablePayPence: number, smallEmployerRelief: boolean): number {
  const rate = smallEmployerRelief ? params.statutory.smallEmployerRecoveryRate : params.statutory.recoveryRate;
  return Math.round(recoverablePayPence * rate);
}
