import { describe, expect, it } from "vitest";
import { TAX_YEAR_2026_27 } from "@/lib/payroll/rates";
import { employeeCostRate, projectFinancials } from "./costing";

describe("employee cost rate", () => {
  it("adds employer's NI and pension to pay, over contracted hours", () => {
    // £39,000: NI 15% × (39,000 − 5,004) = 5,099.40; pension 3% × (39,000 − 6,240) = 982.80; ÷ 1,950 hours.
    const r = employeeCostRate({ pay_basis: "salary", annual_salary: 39000, hourly_rate: null, weekly_hours: 37.5, pension_enrolled: true, pension_employer_pct: 3 }, TAX_YEAR_2026_27);
    expect(r).toBe(23.12);
    // Pension only on qualifying earnings, capped at the upper limit.
    const high = employeeCostRate({ pay_basis: "salary", annual_salary: 97500, hourly_rate: null, weekly_hours: 37.5, pension_enrolled: false, pension_employer_pct: 3 }, TAX_YEAR_2026_27);
    expect(high).toBe(Math.round(((97500 + (97500 - 5004) * 0.15) / 1950) * 100) / 100);
    expect(employeeCostRate({ pay_basis: "hourly", annual_salary: null, hourly_rate: 12.71, weekly_hours: 20, pension_enrolled: false, pension_employer_pct: 3 }, TAX_YEAR_2026_27)).toBe(13.89); // (13,218.40 + 1,232.16) ÷ 1,040
    expect(employeeCostRate({ pay_basis: "salary", annual_salary: null, hourly_rate: null, weekly_hours: 37.5, pension_enrolled: true, pension_employer_pct: 3 }, TAX_YEAR_2026_27)).toBe(0);
  });
});

describe("project financials", () => {
  const time = [
    { hours: 10, billable: true, billRate: 80, costRate: 25, invoiced: true },
    { hours: 5, billable: true, billRate: 80, costRate: 25, invoiced: false },
    { hours: 2, billable: false, billRate: 80, costRate: 40, invoiced: false },
  ];
  const costs = [
    { amount: 200, billable: true, markupPct: 10, invoiced: false },
    { amount: 150, billable: false, markupPct: 0, invoiced: false },
  ];

  it("works out cost, unbilled work and margin for hourly projects", () => {
    const f = projectFinancials({ billing: "hourly", fixedPrice: null, budget: 1000, time, costs, invoiced: 800 });
    expect(f).toMatchObject({ hours: 17, billableHours: 15, timeCost: 455, otherCosts: 350, totalCost: 805, unbilled: 620, expectedRevenue: 1420, profit: -5, expectedProfit: 615, margin: 43.3, budgetUsedPct: 80.5, leftToInvoice: null });
  });

  it("uses the price for fixed-price projects", () => {
    const f = projectFinancials({ billing: "fixed", fixedPrice: 3000, budget: 0, time, costs, invoiced: 900 });
    expect(f).toMatchObject({ unbilled: 0, expectedRevenue: 3000, expectedProfit: 2195, leftToInvoice: 2100, budgetUsedPct: null });
  });
});
