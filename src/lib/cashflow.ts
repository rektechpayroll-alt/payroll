import type { Invoice, Bill, PayrollRun } from "./queries";

/**
 * Cash Flow Forecasting — an AR/AP aging-style projection built from real outstanding
 * invoices and bills, plus the current payroll run's own cost if its payday falls in
 * range. This is the "Predictive cash-flow alerts tied to payroll" idea from the
 * strategy doc's forward-looking list, now shipped rather than proposed.
 */

export type CashFlowBucket = {
  label: string;
  cashIn: number;
  cashOut: number;
  net: number;
  runningBalance: number;
};

export type CashFlowForecast = {
  startingBalance: number;
  buckets: CashFlowBucket[];
  endingBalance: number;
};

const BUCKET_DEFS: Array<{ label: string; min: number; max: number }> = [
  { label: "Overdue", min: -Infinity, max: -1 },
  { label: "Next 30 days", min: 0, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "90+ days", min: 91, max: Infinity },
];

function daysUntil(dateStr: string, today: Date): number {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return Infinity;
  return Math.floor((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/** payroll_runs.payday is stored without a year ("Wed 30 Sep") — the year lives in period_label instead, so it's reconstructed here rather than assumed. */
function parsePaydayDate(run: PayrollRun): Date | null {
  const yearMatch = run.period_label.match(/\b(20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());
  const parts = run.payday.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const d = new Date(`${parts[1]} ${parts[2]} ${year}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function forecastCashFlow(
  invoices: Invoice[],
  bills: Bill[],
  currentRun: PayrollRun | null,
  startingBalance: number,
  today: Date = new Date()
): CashFlowForecast {
  const openInvoices = invoices.filter((i) => i.status === "sent");
  const openBills = bills.filter((b) => b.status === "unpaid");
  const paydayDate = currentRun && currentRun.status === "open" ? parsePaydayDate(currentRun) : null;
  const payrollCost = currentRun ? currentRun.net_pay + currentRun.employer_ni + currentRun.employer_pension : 0;

  let running = startingBalance;
  const buckets: CashFlowBucket[] = BUCKET_DEFS.map((def) => {
    const cashIn = openInvoices
      .filter((i) => {
        const d = daysUntil(i.due_date, today);
        return d >= def.min && d <= def.max;
      })
      .reduce((sum, i) => sum + i.total, 0);

    let cashOut = openBills
      .filter((b) => {
        const d = daysUntil(b.due_date, today);
        return d >= def.min && d <= def.max;
      })
      .reduce((sum, b) => sum + b.total, 0);

    if (paydayDate) {
      const d = Math.floor((paydayDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (d >= def.min && d <= def.max) cashOut += payrollCost;
    }

    const net = Math.round((cashIn - cashOut) * 100) / 100;
    running = Math.round((running + net) * 100) / 100;
    return { label: def.label, cashIn: Math.round(cashIn * 100) / 100, cashOut: Math.round(cashOut * 100) / 100, net, runningBalance: running };
  });

  return { startingBalance, buckets, endingBalance: running };
}
