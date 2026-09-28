import { beforeAll, describe, expect, it, vi } from "vitest";

// Point the app at the throwaway database before anything imports lib/db.
const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());

import { signInAs, testUser } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import { getPool } from "@/lib/db";
import * as q from "@/lib/queries";
import * as runs from "@/lib/payroll/runs";

const suite = TEST_DB ? describe : describe.skip;

suite("multi-business isolation", () => {
  let a: string;
  let b: string;
  beforeAll(async () => {
    signInAs("user_a", null);
    a = await createBusiness({ name: "Alpha Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    signInAs("user_b", null);
    b = await createBusiness({ name: "Bravo Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: true });
  });

  it("each user sees only their own business", async () => {
    signInAs("user_a", a);
    expect((await q.getCompany()).name).toBe("Alpha Ltd");
    expect(await q.getEmployees()).toHaveLength(0);
    signInAs("user_b", b);
    expect((await q.getCompany()).name).toBe("Bravo Ltd");
    expect((await q.getEmployees()).length).toBe(15);
  });

  it("can't read or change another business's records by id", async () => {
    signInAs("user_b", b);
    const bInvoice = (await q.getInvoices())[0];
    const bRun = (await q.getCurrentRun())!;
    const bLine = (await q.getLinesForRun(bRun.id)).find((l) => l.severity && l.severity !== "critical")!;
    const bEmployee = (await q.getEmployees())[0];

    signInAs("user_a", a);
    expect(await q.getInvoiceById(bInvoice.id)).toBeNull();
    expect(await q.updateInvoiceStatus(bInvoice.id, "void")).toBeUndefined();
    expect(await q.getLinesForRun(bRun.id)).toEqual([]);
    expect(await q.resolveLine(bLine.id)).toBeUndefined();
    expect(await q.getEmployeeById(bEmployee.id)).toBeNull();
    await expect(q.createExpenseClaim({ employeeId: bEmployee.id, description: "x", category: "x", amount: 1, expenseDate: "1 Oct 2026" })).rejects.toThrow();

    signInAs("user_b", b);
    expect((await q.getInvoiceById(bInvoice.id))!.status).not.toBe("void");
    expect((await q.getLinesForRun(bRun.id)).find((l) => l.id === bLine.id)!.resolved).toBe(0);
  });

  it("a new blank business has books but no payroll run", async () => {
    signInAs("user_a", a);
    expect(await q.getCurrentRun()).toBeUndefined();
    const { rows } = await getPool().query("SELECT COUNT(*)::int AS n FROM gl_accounts WHERE company_id = $1", [a]);
    expect(rows[0].n).toBeGreaterThan(5);
  });
});

suite("payroll engine end to end", () => {
  let co: string;
  beforeAll(async () => {
    signInAs("user_payroll", null);
    co = await createBusiness({ name: "Payroll Test Ltd", paySchedule: "Monthly", employeeCount: 2, sampleData: false });
    signInAs("user_payroll", co);
    const alice = await q.createEmployee({
      name: "Alice Adams", role: "Engineer", email: "alice@example.test", employmentType: "Full-time", startDate: "1 Apr 2026",
      taxCode: "1257L", niNumber: "QQ123456A", weeklyHours: 37.5, annualSalary: 36_000, payFrequency: "monthly",
    });
    await q.updateEmployeePayDetails(alice.id, {
      payBasis: "salary", annualSalary: 36_000, hourlyRate: null, payFrequency: "monthly", niCategory: "A", studentLoanPlan: null,
      postgradLoan: false, pensionEnrolled: true, pensionEmployeePct: 5, pensionEmployerPct: 3, dateOfBirth: "1990-01-01",
      isDirector: false, previousPay: 0, previousTax: 0, leavingDate: null,
    });
    await q.createEmployee({
      name: "Bob Brown", role: "Assistant", email: "bob@example.test", employmentType: "Full-time", startDate: "1 Apr 2026",
      taxCode: "1257L", niNumber: "TBC", weeklyHours: 37.5, annualSalary: 18_000, payFrequency: "monthly",
    });
  });

  it("calculates a monthly run that matches the engine's hand-checked figures", async () => {
    const runId = await runs.createPayRun("monthly", "2026-04-30");
    const lines = await runs.getPayslipLines(runId);
    const alice = lines.find((l) => l.employee_name === "Alice Adams")!;
    expect(alice).toMatchObject({ gross_pay: 3000, income_tax: 390.2, employee_ni: 156.16, employee_pension: 99.2, net_pay: 2354.44, employer_ni: 387.45 });
    const bob = lines.find((l) => l.employee_name === "Bob Brown")!;
    // £18k / 37.5h is £9.23/hour — below the £12.71 National Living Wage, and no NI number
    expect(bob.severity).toBe("critical");
    expect(bob.flags!.map((f) => f.tag)).toEqual(expect.arrayContaining(["Below minimum wage", "Missing NI number"]));
  });

  it("won't approve a run with a blocking problem, and recalculates after a fix", async () => {
    const run = (await q.getCurrentRun())!;
    await expect(q.approveRun(run.id)).rejects.toThrow(/Fix 1 blocking item/);
    const bob = (await q.getEmployees()).find((e) => e.name === "Bob Brown")!;
    await q.updateEmployeePayDetails(bob.id, {
      payBasis: "salary", annualSalary: 26_000, hourlyRate: null, payFrequency: "monthly", niCategory: "A", studentLoanPlan: null,
      postgradLoan: false, pensionEnrolled: true, pensionEmployeePct: 5, pensionEmployerPct: 3, dateOfBirth: null,
      isDirector: false, previousPay: 0, previousTax: 0, leavingDate: null,
    });
    await runs.recalculatePayRun(run.id);
    const fixed = (await runs.getPayslipLines(run.id)).find((l) => l.employee_name === "Bob Brown")!;
    expect(fixed.severity).toBe("serious"); // still no NI number, but no longer blocking
  });

  it("adjusting a line recalculates it and the run totals", async () => {
    const run = (await q.getCurrentRun())!;
    const alice = (await runs.getPayslipLines(run.id)).find((l) => l.employee_name === "Alice Adams")!;
    await runs.updatePayLine(alice.id, { additions: 500, hoursWorked: null });
    const after = (await runs.getPayslipLines(run.id)).find((l) => l.id === alice.id)!;
    expect(after.gross_pay).toBe(3500);
    expect(after.income_tax).toBe(490.2); // £1,951 + £500 taxable → £2,451 × 20%
    const summary = (await runs.getPayRun(run.id))!;
    const lines = await runs.getPayslipLines(run.id);
    expect(summary.net_pay).toBeCloseTo(lines.reduce((s, l) => s + l.net_pay, 0), 2);
  });

  it("approval posts a balanced, itemised journal and feeds the next month's YTD", async () => {
    const run = (await q.getCurrentRun())!;
    const lines = await q.getLinesForRun(run.id);
    for (const l of lines.filter((x) => x.severity && x.severity !== "critical")) await q.resolveLine(l.id);
    const result = await q.approveRun(run.id);
    expect(result.journalPosted).toBe(true);
    const tb = await q.getTrialBalance();
    const dr = tb.reduce((s, r) => s + r.debit, 0);
    const cr = tb.reduce((s, r) => s + r.credit, 0);
    expect(dr).toBeCloseTo(cr, 2);
    expect(tb.find((r) => r.code === "7000")!.debit).toBeCloseTo(3500 + 26_000 / 12, 2);

    // Month 2: Alice's cumulative code catches up the April bonus rounding.
    const may = await runs.createPayRun("monthly", "2026-05-29");
    const alice = (await runs.getPayslipLines(may)).find((l) => l.employee_name === "Alice Adams")!;
    // YTD taxable 3,500 + 3,000 = 6,500 − free pay 2,096.50 = 4,403.50 → £4,403 × 20% = 880.60, less 490.20 paid
    expect(alice.income_tax).toBe(390.4);
    const ytd = await runs.getYearToDate(alice.employee_id!, may);
    expect(ytd.gross).toBe(6500);
  });

  it("locks approved runs and refuses a second open run", async () => {
    const all = await runs.listPayRuns();
    const approved = all.find((r) => r.status.startsWith("approved"))!;
    const line = (await runs.getPayslipLines(approved.id))[0];
    await expect(runs.updatePayLine(line.id, { additions: 1, hoursWorked: null })).rejects.toThrow(/locked/);
    await expect(runs.createPayRun("monthly", "2026-06-30")).rejects.toThrow(/open run/);
  });

  it("another business can't touch these runs", async () => {
    const runId = (await q.getCurrentRun())!.id;
    signInAs("user_intruder", null);
    const other = await createBusiness({ name: "Intruder Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    signInAs("user_intruder", other);
    expect(await runs.getPayRun(runId)).toBeNull();
    expect(await runs.getPayslipLines(runId)).toEqual([]);
    await expect(runs.deletePayRun(runId)).rejects.toThrow(/not found/);
    signInAs("user_payroll", co);
    expect(testUser.companyId).toBe(co);
  });
});
