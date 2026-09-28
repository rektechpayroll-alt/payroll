/**
 * Key ratios and the financial health scorecard, all worked out from ledger totals. Pure
 * functions: data.ts gathers the figures, this decides what they mean.
 */

export type LedgerFigures = {
  /** Length of the period the income/cost figures cover. */
  days: number;
  revenue: number;
  costOfSales: number;
  /** Overheads, excluding cost of sales. */
  expenses: number;
  payrollCosts: number;
  depreciation: number;
  /** Balances at the end of the period. */
  cash: number;
  debtors: number;
  creditors: number;
  currentAssets: number;
  currentLiabilities: number;
  /** Revenue for the same-length period immediately before, for growth. */
  priorRevenue: number;
  /** Median days customers took to pay, from real payments; null with no history. */
  averageDaysToPay: number | null;
};

export type KpiFormat = "money" | "percent" | "ratio" | "days" | "months";

export type Kpi = { key: string; label: string; value: number | null; format: KpiFormat; explain: string };

const safeDiv = (a: number, b: number) => (b === 0 ? null : a / b);
const round = (n: number | null, dp = 1) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** dp) / 10 ** dp);

export function computeKpis(f: LedgerFigures): Kpi[] {
  const grossProfit = f.revenue - f.costOfSales;
  const netProfit = grossProfit - f.expenses;
  const monthlyNet = (netProfit + f.depreciation) / (f.days / 30.44);
  // Runway only means something while the business is spending more than it earns.
  const runway = monthlyNet < 0 ? Math.max(0, f.cash) / -monthlyNet : null;
  const purchases = f.costOfSales + f.expenses - f.payrollCosts - f.depreciation;
  const growth = f.priorRevenue > 0 ? ((f.revenue - f.priorRevenue) / f.priorRevenue) * 100 : null;

  return [
    { key: "revenue", label: "Revenue", value: round(f.revenue, 2), format: "money", explain: "Sales and other income in the period." },
    { key: "growth", label: "Revenue growth", value: round(growth), format: "percent", explain: "Change against the same length of time just before." },
    { key: "grossMargin", label: "Gross margin", value: round(f.revenue > 0 ? (grossProfit / f.revenue) * 100 : null), format: "percent", explain: "What's left of each £1 of sales after the direct cost of making those sales." },
    { key: "netMargin", label: "Net margin", value: round(f.revenue > 0 ? (netProfit / f.revenue) * 100 : null), format: "percent", explain: "Profit before tax as a share of revenue." },
    { key: "netProfit", label: "Net profit", value: round(netProfit, 2), format: "money", explain: "Revenue less every cost in the period, before tax." },
    { key: "payrollShare", label: "Payroll as % of revenue", value: round(f.revenue > 0 ? (f.payrollCosts / f.revenue) * 100 : null), format: "percent", explain: "Wages, employer's NI and pension against revenue." },
    { key: "currentRatio", label: "Current ratio", value: round(safeDiv(f.currentAssets, f.currentLiabilities), 2), format: "ratio", explain: "Short-term assets for every £1 owed in the next year. Above 1.5 is comfortable." },
    { key: "quickRatio", label: "Quick ratio", value: round(safeDiv(f.cash + f.debtors, f.currentLiabilities), 2), format: "ratio", explain: "Cash and money owed to you for every £1 you owe. Above 1 means you can pay your bills without new sales." },
    { key: "workingCapital", label: "Working capital", value: round(f.currentAssets - f.currentLiabilities, 2), format: "money", explain: "Short-term assets less short-term debts." },
    { key: "debtorDays", label: "Debtor days", value: round(f.revenue > 0 ? (f.debtors / f.revenue) * f.days : null, 0), format: "days", explain: "How many days of sales are still unpaid." },
    { key: "creditorDays", label: "Creditor days", value: round(purchases > 0 ? (f.creditors / purchases) * f.days : null, 0), format: "days", explain: "How many days of purchases you haven't paid for yet." },
    { key: "daysToPay", label: "Average time to get paid", value: f.averageDaysToPay, format: "days", explain: "Median days from invoice to payment, from real payments." },
    { key: "runway", label: "Cash runway", value: round(runway), format: "months", explain: runway === null ? "Not burning cash — the business is covering its costs." : "How long current cash lasts at the current monthly loss." },
  ];
}

export type HealthArea = { key: string; label: string; score: number; headline: string; advice: string };
export type HealthScore = { score: number; grade: "A" | "B" | "C" | "D" | "E"; areas: HealthArea[] };

/** Straight-line score between a poor value (0) and a strong value (100), clamped. */
function band(value: number, poor: number, strong: number): number {
  const s = ((value - poor) / (strong - poor)) * 100;
  return Math.round(Math.max(0, Math.min(100, s)));
}

/**
 * Five areas scored 0–100 against typical UK small-business ranges, then combined. Areas with
 * no data yet (no revenue, no prior period) are left out rather than scored as failures.
 */
export function healthScore(f: LedgerFigures, forecastLowest: number | null): HealthScore {
  const k = Object.fromEntries(computeKpis(f).map((x) => [x.key, x.value]));
  const areas: HealthArea[] = [];

  if (k.netMargin !== null) {
    const m = k.netMargin as number;
    areas.push({
      key: "profitability",
      label: "Profitability",
      score: band(m, -10, 20),
      headline: `${m.toFixed(1)}% net margin`,
      advice: m < 0 ? "You're making a loss. Look at your largest overheads and whether prices cover your costs." : m < 10 ? "Profitable but thin. A small price rise or cutting one large overhead would make a big difference." : "Healthy margins — keep an eye on costs as you grow.",
    });
  }
  if (k.quickRatio !== null) {
    const q = k.quickRatio as number;
    areas.push({
      key: "liquidity",
      label: "Liquidity",
      score: band(q, 0.5, 2),
      headline: `${q.toFixed(2)} quick ratio`,
      advice: q < 1 ? "You owe more in the short term than you hold in cash and debtors. Chase receivables and stagger large payments." : "You can cover what you owe from cash and money due in.",
    });
  } else if (f.cash > 0) {
    areas.push({ key: "liquidity", label: "Liquidity", score: 100, headline: "Nothing owed", advice: "You have no short-term debts." });
  }
  if (forecastLowest !== null) {
    const monthlyCosts = (f.costOfSales + f.expenses - f.depreciation) / (f.days / 30.44);
    const cover = monthlyCosts > 0 ? forecastLowest / monthlyCosts : forecastLowest >= 0 ? 3 : -1;
    areas.push({
      key: "cash",
      label: "Cash",
      score: band(cover, 0, 3),
      headline: forecastLowest < 0 ? "Forecast goes overdrawn" : `${cover.toFixed(1)} months of costs at the lowest point`,
      advice: forecastLowest < 0 ? "The 90-day forecast drops below zero. Bring in payments, delay spending or arrange funding before then." : cover < 1 ? "Cash will get tight. Aim to keep at least one month of costs in the bank." : "Cash comfortably covers the next three months.",
    });
  }
  const collection = (k.daysToPay ?? k.debtorDays) as number | null;
  if (collection !== null) {
    areas.push({
      key: "collections",
      label: "Getting paid",
      score: band(-collection, -90, -30),
      headline: `${collection} day${collection === 1 ? "" : "s"} to get paid`,
      advice: collection > 45 ? "Customers are slow to pay. Shorter terms, automatic reminders and card payments all help." : "Customers pay promptly.",
    });
  }
  if (k.growth !== null) {
    const g = k.growth as number;
    areas.push({
      key: "growth",
      label: "Growth",
      score: band(g, -20, 20),
      headline: `${g >= 0 ? "+" : ""}${g.toFixed(1)}% revenue`,
      advice: g < 0 ? "Sales are down on the period before. Check whether it's seasonal or a lost customer." : "Sales are growing.",
    });
  }

  const score = areas.length ? Math.round(areas.reduce((s, a) => s + a.score, 0) / areas.length) : 0;
  const grade = score >= 80 ? "A" : score >= 65 ? "B" : score >= 50 ? "C" : score >= 35 ? "D" : "E";
  return { score, grade, areas };
}

/**
 * A suggested budget for each target month from an account's monthly history (map of
 * "YYYY-MM" → amount). Same month last year, scaled by the year-on-year trend, when there's a
 * year of history; otherwise the average of the last three months that had any activity.
 */
export function suggestBudget(history: Record<string, number>, targetMonths: string[]): { amounts: number[]; basis: string } {
  const months = Object.keys(history).filter((m) => history[m] !== 0).sort();
  if (!months.length) return { amounts: targetMonths.map(() => 0), basis: "No history yet" };

  const shift = (m: string, by: number) => {
    const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1));
    return d.toISOString().slice(0, 7);
  };
  const latest = months[months.length - 1];
  const sum = (from: string, to: string) => Object.entries(history).filter(([m]) => m >= from && m <= to).reduce((s, [, v]) => s + v, 0);
  const last12 = sum(shift(latest, -11), latest);
  const prior12 = sum(shift(latest, -23), shift(latest, -12));
  const hasYear = months[0] <= shift(latest, -11);

  if (hasYear) {
    // Trend capped at ±25% so one unusual year can't run away with the budget.
    const trend = prior12 > 0 ? Math.max(0.75, Math.min(1.25, last12 / prior12)) : 1;
    return {
      amounts: targetMonths.map((t) => {
        let m = shift(t, -12);
        while (m > latest) m = shift(m, -12);
        return Math.round((history[m] ?? 0) * trend);
      }),
      basis: prior12 > 0 ? `Same month last year, ${trend >= 1 ? "+" : "−"}${Math.abs(Math.round((trend - 1) * 100))}% trend` : "Same month last year",
    };
  }
  const recent = months.slice(-3);
  const avg = Math.round(recent.reduce((s, m) => s + history[m], 0) / recent.length);
  return { amounts: targetMonths.map(() => avg), basis: `Average of the last ${recent.length} month${recent.length === 1 ? "" : "s"}` };
}
