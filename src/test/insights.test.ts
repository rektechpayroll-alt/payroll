import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

import { signInAs } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import * as q from "@/lib/queries";
import * as runs from "@/lib/payroll/runs";
import * as bank from "@/lib/banking/bank";
import * as L from "@/lib/ledger/reports";
import * as I from "@/lib/insights/data";
import { renderToString } from "react-dom/server";
import InsightsPage from "@/app/dashboard/insights/page";
import CashflowPage from "@/app/dashboard/cashflow/page";
import BudgetPage from "@/app/dashboard/budget/page";

const suite = TEST_DB ? describe : describe.skip;
const TODAY = "2026-10-01";

suite("forecast, KPIs, budgets and dashboards from real books", () => {
  let co: string;
  let other: string;
  let run: runs.PayRunSummary;
  beforeAll(async () => {
    signInAs("user_ins", null);
    other = await createBusiness({ name: "Someone Else Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    co = await createBusiness({ name: "Insights Ltd", paySchedule: "Monthly", employeeCount: 1, sampleData: false });
    signInAs("user_ins", co);
    await L.createManualJournal({ date: "2026-06-01", narration: "Owner capital", lines: [{ accountCode: "1200", description: "", debit: 10000, credit: 0 }, { accountCode: "3000", description: "", debit: 0, credit: 10000 }] });

    // Slow Co paid their June invoice 10 days late.
    const june = await q.createInvoice({ customerName: "Slow Co", customerEmail: null, issueDate: "2026-06-01", dueDate: "2026-06-15", vatRate: 20, notes: null, items: [{ description: "Work", quantity: 1, unitPrice: 1000 }] });
    await q.updateInvoiceStatus(june.id, "sent");
    const rows = [
      `25/06/2026,FPI,'30-00-00,12345678,SLOW CO REF ${june.invoice_number},,1200.00,11200.00`,
      "15/07/2026,DD,'30-00-00,12345678,GITHUB INC,120.00,,11080.00",
      "15/08/2026,DD,'30-00-00,12345678,GITHUB INC,120.00,,10960.00",
      "15/09/2026,DD,'30-00-00,12345678,GITHUB INC,120.00,,10840.00",
    ];
    await bank.importStatement("s.csv", `Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance\n${rows.join("\n")}`);
    await bank.createRule("github", "debit", "7500");
    expect((await bank.autoReconcile()).remaining).toBe(0);

    const open = await q.createInvoice({ customerName: "slow co ", customerEmail: null, issueDate: "2026-09-10", dueDate: "2026-10-10", vatRate: 20, notes: null, items: [{ description: "More work", quantity: 1, unitPrice: 1000 }] });
    await q.updateInvoiceStatus(open.id, "sent");
    await q.createBill({ supplierName: "Landlord", category: "Rent", billDate: "2026-09-05", dueDate: "2026-10-05", total: 600 });

    await q.createEmployee({ name: "Paula Pay", role: "Staff", email: "paula@example.test", employmentType: "Full-time", startDate: "2026-09-01", taxCode: "1257L", niNumber: "AB123456C", weeklyHours: 37.5, annualSalary: 30000 });
    const runId = await runs.createPayRun("monthly", "2026-09-30");
    for (const l of (await q.getLinesForRun(runId)).filter((x) => x.severity && x.severity !== "critical")) await q.resolveLine(l.id);
    await q.approveRun(runId);
    run = (await runs.getPayRun(runId))!;
  });

  it("forecasts from what's owed, how customers pay, payroll and habits", async () => {
    const f = await I.cashForecast(90, TODAY);
    expect(f.opening).toBe(1084000);
    const find = (label: RegExp) => f.items.filter((i) => label.test(i.label)).map((i) => ({ date: i.date, amount: i.amount }));
    expect(find(/Slow Co|slow co/)).toEqual([{ date: "2026-10-20", amount: 120000 }]); // due 10 Oct + 10 days late
    expect(find(/Landlord/)).toEqual([{ date: "2026-10-05", amount: -60000 }]);
    expect(find(/Software and IT/)).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"].map((date) => ({ date, amount: -12000 })));

    const pence = (n: number) => Math.round(n * 100);
    const hmrc = run.total_tax + run.total_employee_ni + run.employer_ni + run.total_student_loan - run.statutory_recovered - run.employment_allowance_used;
    expect(find(/Net wages still to pay/)).toEqual([{ date: TODAY, amount: -pence(run.net_pay) }]);
    expect(find(/PAYE and NI owed/)).toEqual([{ date: "2026-10-22", amount: -pence(hmrc) }]);
    expect(find(/^Net pay/)).toEqual(["2026-10-30", "2026-11-30", "2026-12-30"].map((date) => ({ date, amount: -pence(run.net_pay) })));
    expect(find(/^PAYE and NI —/).map((i) => i.date)).toEqual(["2026-11-22", "2026-12-22"]);

    expect(f.closing).toBe(f.opening + f.items.reduce((s, i) => s + i.amount, 0));
    expect(f.weeks).toHaveLength(13);
    expect(f.items.every((i) => i.date >= TODAY && i.date <= "2026-12-30")).toBe(true);
    await expect(I.cashForecast(45, TODAY)).rejects.toThrow(/30, 60, 90 or 180/);
  });

  it("adds what-if items, kept to this business", async () => {
    await expect(I.addForecastItem({ date: "2026-11-01", label: "Loan", amount: 0 })).rejects.toThrow(/amount/);
    const id = await I.addForecastItem({ date: "2026-11-01", label: "Bank loan", amount: 5000 });
    const before = (await I.cashForecast(90, TODAY)).closing;
    expect((await I.cashForecast(90, TODAY)).items.find((i) => i.id === id)).toMatchObject({ date: "2026-11-01", amount: 500000, kind: "manual" });
    signInAs("user_ins", other);
    await expect(I.deleteForecastItem(id)).rejects.toThrow(/no longer exists/);
    signInAs("user_ins", co);
    await I.deleteForecastItem(id);
    expect((await I.cashForecast(90, TODAY)).closing).toBe(before - 500000);
  });

  it("works out KPIs and a health score from the ledger", async () => {
    const r = await I.businessInsights(3, TODAY);
    expect(r.from).toBe("2026-07-02");
    const payroll = run.gross_pay + run.employer_ni + run.employer_pension;
    expect(r.figures).toMatchObject({ revenue: 1000, priorRevenue: 1000, costOfSales: 0, averageDaysToPay: 24 });
    expect(r.figures.expenses).toBeCloseTo(960 + payroll, 2);
    expect(r.figures.cash).toBeCloseTo(10840, 2);
    expect(r.figures.debtors).toBe(1200);
    const k = Object.fromEntries(r.kpis.map((x) => [x.key, x.value]));
    expect(k.growth).toBe(0);
    expect(k.payrollShare).toBeCloseTo((payroll / 1000) * 100, 0);
    expect(r.health.areas.map((a) => a.key)).toContain("cash");
    expect(r.health.grade).toMatch(/[A-E]/);

    const months = await I.monthlyTotals(4, TODAY);
    expect(months.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(months[2].income).toBe(1000);
    expect(months[0].costs).toBe(120);
  });

  it("budgets against actuals, with suggestions from history", async () => {
    const year = await I.budgetYear("2026-10");
    expect(year.months[0]).toBe("2026-10");
    expect(year.months[11]).toBe("2027-09");
    const software = year.rows.find((r) => r.code === "7500")!;
    expect(software.suggestion).toEqual({ amounts: Array(12).fill(120), basis: "Average of the last 3 months" });
    expect(year.rows.find((r) => r.code === "4000")!.suggestion.amounts[0]).toBe(1000); // June and September

    expect(await I.applySuggestedBudgets("2026-10")).toBeGreaterThanOrEqual(3);
    await I.setBudget("2026-10", "7500", [150, ...Array(11).fill(0)]);
    expect(await I.applySuggestedBudgets("2026-10")).toBe(0); // never overwrites a budget you've set
    const after = await I.budgetYear("2026-10");
    expect(after.rows.find((r) => r.code === "7500")!.budget).toEqual([150, ...Array(11).fill(0)]);
    expect(after.rows.find((r) => r.code === "7100")!.budget[5]).toBe(600);

    const past = await I.budgetYear("2026-07");
    expect(past.rows.find((r) => r.code === "7500")!.actual.slice(0, 4)).toEqual([120, 120, 120, 0]);
    await expect(I.setBudget("2026-10", "1200", Array(12).fill(1))).rejects.toThrow(/income and cost/);
    await expect(I.setBudget("2026-10", "7500", [-1, ...Array(11).fill(0)])).rejects.toThrow(/twelve amounts/);
    signInAs("user_ins", other);
    expect((await I.budgetYear("2026-10")).rows.every((r) => r.budget.every((b) => b === 0))).toBe(true);
    signInAs("user_ins", co);
  });

  it("keeps each person's own dashboard layout", async () => {
    expect(await I.getDashboardLayout()).toEqual(I.DEFAULT_WIDGETS);
    await I.saveDashboardLayout(["cashForecast", "health", "cashForecast"]);
    expect(await I.getDashboardLayout()).toEqual(["cashForecast", "health"]);
    await expect(I.saveDashboardLayout(["nope"])).rejects.toThrow(/Unknown/);
    signInAs("user_ins_2", co);
    expect(await I.getDashboardLayout()).toEqual(I.DEFAULT_WIDGETS);
    signInAs("user_ins", co);
  });
});

suite("insight pages render with sample books", () => {
  it("renders the dashboard, forecast and budget without errors", async () => {
    signInAs("user_pages", null);
    const co = await createBusiness({ name: "Sample Pages Ltd", paySchedule: "Monthly", employeeCount: 8, sampleData: true });
    signInAs("user_pages", co);
    const sp = <T,>(v: T) => Promise.resolve(v);
    for (const months of [undefined, "1", "3"]) {
      const html = renderToString(await InsightsPage({ searchParams: sp({ months }) }));
      expect(html).toContain("Financial health");
      expect(html).toContain("Money owed to you");
    }
    for (const days of ["30", "180", "nonsense"]) {
      const html = renderToString(await CashflowPage({ searchParams: sp({ days }) }));
      expect(html).toContain("Week by week");
    }
    await I.applySuggestedBudgets(`${new Date().getUTCFullYear()}-01`);
    const html = renderToString(await BudgetPage({ searchParams: sp({}) }));
    expect(html).toContain("Budget against actual");
    expect(html).toContain("Net profit by month");
    expect(renderToString(await BudgetPage({ searchParams: sp({ start: "2025-04", all: "1" }) }))).toContain("Apr 2025");
  });
});
