import type { TaxYearParams } from "@/lib/payroll/rates";

/** Project costing arithmetic: what an hour of someone's time costs, and what a project earns. */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type CostRateInput = {
  pay_basis: string;
  annual_salary: number | null;
  hourly_rate: number | null;
  weekly_hours: number;
  pension_enrolled: boolean;
  pension_employer_pct: number;
};

/**
 * An hour of this person's time as it costs the business: pay, plus employer's NI above the
 * secondary threshold, plus the employer's pension on qualifying earnings — spread over their
 * contracted hours.
 */
export function employeeCostRate(e: CostRateInput, p: TaxYearParams): number {
  const hoursPerYear = e.weekly_hours * 52;
  if (!(hoursPerYear > 0)) return 0;
  const pay = e.pay_basis === "hourly" ? (e.hourly_rate ?? 0) * hoursPerYear : e.annual_salary ?? 0;
  if (!(pay > 0)) return 0;
  const employerNi = Math.max(0, pay - p.ni.monthly.st * 12) * p.ni.employerRate;
  const pension = e.pension_enrolled ? Math.max(0, Math.min(pay, p.autoEnrolment.qualifyingUpper) - p.autoEnrolment.qualifyingLower) * (e.pension_employer_pct / 100) : 0;
  return round2((pay + employerNi + pension) / hoursPerYear);
}

export type ProjectBilling = "hourly" | "fixed" | "non_billable";

export type FinancialsInput = {
  billing: ProjectBilling;
  fixedPrice: number | null;
  budget: number;
  time: Array<{ hours: number; billable: boolean; billRate: number; costRate: number; invoiced: boolean }>;
  /** Net of VAT. `invoiced` only matters for billable costs. */
  costs: Array<{ amount: number; billable: boolean; markupPct: number; invoiced: boolean }>;
  /** Net of VAT, sent or paid. */
  invoiced: number;
};

export type ProjectFinancials = {
  hours: number;
  billableHours: number;
  timeCost: number;
  otherCosts: number;
  totalCost: number;
  invoiced: number;
  /** Billable time and costs not yet on an invoice (hourly projects). */
  unbilled: number;
  /** What the project should bring in: fixed price, or invoiced plus unbilled for hourly work. */
  expectedRevenue: number;
  profit: number;
  expectedProfit: number;
  margin: number | null;
  budgetUsedPct: number | null;
  /** Fixed-price: how much of the price is still to invoice. */
  leftToInvoice: number | null;
};

export function projectFinancials(p: FinancialsInput): ProjectFinancials {
  const hours = round2(p.time.reduce((s, t) => s + t.hours, 0));
  const billableHours = round2(p.time.filter((t) => t.billable).reduce((s, t) => s + t.hours, 0));
  const timeCost = round2(p.time.reduce((s, t) => s + t.hours * t.costRate, 0));
  const otherCosts = round2(p.costs.reduce((s, c) => s + c.amount, 0));
  const totalCost = round2(timeCost + otherCosts);
  const unbilled =
    p.billing === "hourly"
      ? round2(
          p.time.filter((t) => t.billable && !t.invoiced).reduce((s, t) => s + t.hours * t.billRate, 0) +
            p.costs.filter((c) => c.billable && !c.invoiced).reduce((s, c) => s + c.amount * (1 + c.markupPct / 100), 0)
        )
      : 0;
  const expectedRevenue = p.billing === "fixed" ? p.fixedPrice ?? 0 : p.billing === "hourly" ? round2(p.invoiced + unbilled) : 0;
  const profit = round2(p.invoiced - totalCost);
  const expectedProfit = round2(expectedRevenue - totalCost);
  return {
    hours,
    billableHours,
    timeCost,
    otherCosts,
    totalCost,
    invoiced: round2(p.invoiced),
    unbilled,
    expectedRevenue,
    profit,
    expectedProfit,
    margin: expectedRevenue > 0 ? Math.round((expectedProfit / expectedRevenue) * 1000) / 10 : null,
    budgetUsedPct: p.budget > 0 ? Math.round((totalCost / p.budget) * 1000) / 10 : null,
    leftToInvoice: p.billing === "fixed" ? round2(Math.max(0, (p.fixedPrice ?? 0) - p.invoiced)) : null,
  };
}
