/**
 * Cash flow forecast arithmetic. Everything is in pence so the running balance never picks up
 * floating-point drift; the data gathering (what's owed, what repeats) lives in sources.ts.
 */

export type CashItemKind = "invoice" | "bill" | "recurring" | "wages" | "hmrc" | "pension" | "vat" | "regular" | "manual";

export type CashItem = {
  date: string;
  /** Pence; positive is money in, negative is money out. */
  amount: number;
  label: string;
  kind: CashItemKind;
  /** "known" comes from a real document; "estimated" is projected from history or schedules. */
  certainty: "known" | "estimated";
  /** Set when a manual what-if item can be removed from the forecast. */
  id?: string;
};

export type ForecastWeek = { start: string; end: string; cashIn: number; cashOut: number; closing: number };

export type Forecast = {
  today: string;
  days: number;
  opening: number;
  closing: number;
  cashIn: number;
  cashOut: number;
  lowest: { date: string; balance: number };
  /** First day the balance goes below zero, if it does. */
  overdrawnOn: string | null;
  daily: Array<{ date: string; balance: number }>;
  weeks: ForecastWeek[];
  items: CashItem[];
};

export const FORECAST_HORIZONS = [30, 60, 90, 180] as const;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function buildForecast(opening: number, items: CashItem[], today: string, days: number): Forecast {
  const end = addDays(today, days);
  // Anything already late is expected today; anything past the horizon is left out.
  const inRange = items
    .map((i) => (i.date < today ? { ...i, date: today } : i))
    .filter((i) => i.date <= end && i.amount !== 0)
    .sort((a, b) => (a.date === b.date ? b.amount - a.amount : a.date < b.date ? -1 : 1));

  const byDate = new Map<string, number>();
  for (const i of inRange) byDate.set(i.date, (byDate.get(i.date) ?? 0) + i.amount);

  const daily: Forecast["daily"] = [];
  let balance = opening;
  let lowest = { date: today, balance: opening };
  let overdrawnOn: string | null = opening < 0 ? today : null;
  for (let n = 0; n <= days; n++) {
    const date = addDays(today, n);
    balance += byDate.get(date) ?? 0;
    daily.push({ date, balance });
    if (balance < lowest.balance) lowest = { date, balance };
    if (balance < 0 && !overdrawnOn) overdrawnOn = date;
  }

  const weeks: ForecastWeek[] = [];
  for (let n = 0; n <= days; n += 7) {
    const start = addDays(today, n);
    const weekEnd = addDays(today, Math.min(n + 6, days));
    const inWeek = inRange.filter((i) => i.date >= start && i.date <= weekEnd);
    weeks.push({
      start,
      end: weekEnd,
      cashIn: inWeek.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0),
      cashOut: -inWeek.filter((i) => i.amount < 0).reduce((s, i) => s + i.amount, 0),
      closing: daily[Math.min(n + 6, days)].balance,
    });
  }

  return {
    today,
    days,
    opening,
    closing: balance,
    cashIn: inRange.filter((i) => i.amount > 0).reduce((s, i) => s + i.amount, 0),
    cashOut: -inRange.filter((i) => i.amount < 0).reduce((s, i) => s + i.amount, 0),
    lowest,
    overdrawnOn,
    daily,
    weeks,
    items: inRange,
  };
}

/**
 * PAYE, NI and student loan deductions are due to HMRC by the 22nd after the end of the tax month
 * (tax months run from the 6th to the 5th). Auto-enrolment pension contributions are due by the
 * same date, so both use this.
 */
export function hmrcDueDate(payDate: string): string {
  const y = Number(payDate.slice(0, 4));
  const m = Number(payDate.slice(5, 7));
  const d = Number(payDate.slice(8, 10));
  // Paid on or before the 5th → the tax month ends this month; otherwise next month.
  const due = new Date(Date.UTC(y, d <= 5 ? m - 1 : m, 22));
  return due.toISOString().slice(0, 10);
}

/**
 * How late a customer usually pays, in days after the due date (never negative, so early payers
 * are expected on time). Uses up to their last 6 paid invoices.
 */
export function typicalLateness(history: Array<{ dueDate: string; paidOn: string }>): number | null {
  if (!history.length) return null;
  const recent = [...history].sort((a, b) => (a.paidOn < b.paidOn ? 1 : -1)).slice(0, 6);
  const lateness = recent.map((h) => Math.max(0, daysBetween(h.dueDate, h.paidOn))).sort((a, b) => a - b);
  // Median, so one very late payment doesn't skew the forecast.
  const mid = Math.floor(lateness.length / 2);
  return lateness.length % 2 ? lateness[mid] : Math.round((lateness[mid - 1] + lateness[mid]) / 2);
}
