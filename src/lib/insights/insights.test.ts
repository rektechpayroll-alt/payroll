import { describe, expect, it } from "vitest";
import { buildForecast, hmrcDueDate, typicalLateness } from "./forecast";
import { computeKpis, healthScore, suggestBudget, type LedgerFigures } from "./kpis";

describe("cash flow forecast", () => {
  const items = [
    { date: "2026-09-01", amount: 50000, label: "Overdue invoice", kind: "invoice" as const, certainty: "known" as const },
    { date: "2026-10-05", amount: -300000, label: "Big bill", kind: "bill" as const, certainty: "known" as const },
    { date: "2026-10-20", amount: 400000, label: "Invoice", kind: "invoice" as const, certainty: "known" as const },
    { date: "2027-06-01", amount: -1, label: "Too far out", kind: "bill" as const, certainty: "known" as const },
  ];

  it("runs a daily balance, moving late items to today and dropping ones past the horizon", () => {
    const f = buildForecast(200000, items, "2026-10-01", 30);
    expect(f.daily).toHaveLength(31);
    expect(f.daily[0]).toEqual({ date: "2026-10-01", balance: 250000 });
    expect(f.items.map((i) => i.date)).toEqual(["2026-10-01", "2026-10-05", "2026-10-20"]);
    expect(f.lowest).toEqual({ date: "2026-10-05", balance: -50000 });
    expect(f.overdrawnOn).toBe("2026-10-05");
    expect(f.closing).toBe(350000);
    expect(f.cashIn).toBe(450000);
    expect(f.cashOut).toBe(300000);
  });

  it("groups into weeks whose closing balances line up with the daily run", () => {
    const f = buildForecast(200000, items, "2026-10-01", 30);
    expect(f.weeks).toHaveLength(5);
    expect(f.weeks[0]).toEqual({ start: "2026-10-01", end: "2026-10-07", cashIn: 50000, cashOut: 300000, closing: -50000 });
    expect(f.weeks[4]).toMatchObject({ start: "2026-10-29", end: "2026-10-31", closing: 350000 });
    expect(f.weeks.reduce((s, w) => s + w.cashIn - w.cashOut, 200000)).toBe(f.closing);
  });

  it("knows when HMRC and pension payments are due", () => {
    expect(hmrcDueDate("2026-09-30")).toBe("2026-10-22"); // tax month to 5 Oct
    expect(hmrcDueDate("2026-10-05")).toBe("2026-10-22");
    expect(hmrcDueDate("2026-10-06")).toBe("2026-11-22");
    expect(hmrcDueDate("2026-12-31")).toBe("2027-01-22");
  });

  it("predicts lateness from the median of recent payments", () => {
    expect(typicalLateness([])).toBeNull();
    const h = (due: string, paid: string) => ({ dueDate: due, paidOn: paid });
    expect(typicalLateness([h("2026-01-10", "2026-01-20"), h("2026-02-10", "2026-02-15"), h("2026-03-10", "2026-06-10")])).toBe(10);
    expect(typicalLateness([h("2026-01-10", "2026-01-01")])).toBe(0); // early payers are expected on time
  });
});

const base: LedgerFigures = {
  days: 365, revenue: 200000, costOfSales: 60000, expenses: 110000, payrollCosts: 70000, depreciation: 2000,
  cash: 40000, debtors: 30000, creditors: 8000, currentAssets: 70000, currentLiabilities: 35000, priorRevenue: 160000, averageDaysToPay: 38,
};

describe("KPIs and health", () => {
  it("works out the ratios", () => {
    const k = Object.fromEntries(computeKpis(base).map((x) => [x.key, x.value]));
    expect(k).toMatchObject({
      revenue: 200000, growth: 25, grossMargin: 70, netMargin: 15, netProfit: 30000, payrollShare: 35,
      currentRatio: 2, quickRatio: 2, workingCapital: 35000, debtorDays: 55, daysToPay: 38, runway: null,
    });
    // Purchases exclude payroll and depreciation: 60k + 110k − 70k − 2k = 98k.
    expect(k.creditorDays).toBe(30);
  });

  it("shows runway only when losing money, and copes with no revenue", () => {
    const losing = Object.fromEntries(computeKpis({ ...base, revenue: 100000, costOfSales: 20000, expenses: 140000, depreciation: 0 }).map((x) => [x.key, x.value]));
    expect(losing.runway).toBe(8); // £60k loss over a year = £4,930/month; £40k lasts ~8.1 months
    const broke = Object.fromEntries(computeKpis({ ...base, cash: -5000, revenue: 100000, costOfSales: 20000, expenses: 140000 }).map((x) => [x.key, x.value]));
    expect(broke.runway).toBe(0);
    const empty = Object.fromEntries(computeKpis({ ...base, revenue: 0, priorRevenue: 0 }).map((x) => [x.key, x.value]));
    expect(empty).toMatchObject({ grossMargin: null, netMargin: null, growth: null, debtorDays: null });
  });

  it("scores a healthy business well and a struggling one badly", () => {
    const good = healthScore(base, 45000);
    expect(good.areas.map((a) => a.key)).toEqual(["profitability", "liquidity", "cash", "collections", "growth"]);
    expect(good.grade).toMatch(/A|B/);
    const bad = healthScore({ ...base, revenue: 100000, expenses: 150000, cash: 2000, debtors: 5000, averageDaysToPay: 95, priorRevenue: 150000 }, -3000);
    expect(bad.grade).toBe("E");
    expect(bad.areas.find((a) => a.key === "cash")!.headline).toBe("Forecast goes overdrawn");
  });

  it("leaves out areas with no data rather than failing them", () => {
    const h = healthScore({ ...base, revenue: 0, priorRevenue: 0, costOfSales: 0, expenses: 0, payrollCosts: 0, depreciation: 0, debtors: 0, creditors: 0, currentLiabilities: 0, averageDaysToPay: null }, null);
    expect(h.areas.map((a) => a.key)).toEqual(["liquidity"]);
    expect(h.score).toBe(100);
  });
});

describe("budget suggestions", () => {
  it("averages recent months when there's less than a year of history", () => {
    expect(suggestBudget({}, ["2026-10"])).toEqual({ amounts: [0], basis: "No history yet" });
    expect(suggestBudget({ "2026-07": 100, "2026-08": 0, "2026-09": 200, "2026-06": 300 }, ["2026-10", "2026-11"])).toEqual({ amounts: [200, 200], basis: "Average of the last 3 months" });
  });

  it("follows seasonality and trend with a year or more", () => {
    const history: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) history[`2024-${String(m).padStart(2, "0")}`] = 1000;
    for (let m = 1; m <= 12; m++) history[`2025-${String(m).padStart(2, "0")}`] = m === 12 ? 2400 : 1000; // December peak
    // Last 12 months 13,400 vs 12,000 before → +12% trend.
    const s = suggestBudget(history, ["2026-01", "2026-12"]);
    expect(s.basis).toBe("Same month last year, +12% trend");
    expect(s.amounts).toEqual([1117, 2680]);
  });
});
