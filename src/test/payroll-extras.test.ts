import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());

import { NextRequest } from "next/server";
import { signInAs } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import * as q from "@/lib/queries";
import * as runs from "@/lib/payroll/runs";
import * as records from "@/lib/payroll/records";
import { GET as downloadPayments } from "@/app/api/payroll/runs/[id]/payments/route";

const suite = TEST_DB ? describe : describe.skip;

const payDetails = (over: Partial<q.PayDetailsInput> = {}): q.PayDetailsInput => ({
  payBasis: "salary", annualSalary: 36_000, hourlyRate: null, payFrequency: "monthly", niCategory: "A", studentLoanPlan: null,
  postgradLoan: false, pensionEnrolled: true, pensionEmployeePct: 5, pensionEmployerPct: 3, dateOfBirth: "1990-01-01",
  isDirector: false, previousPay: 0, previousTax: 0, leavingDate: null, ...over,
});

async function hire(name: string, niNumber = "QQ123456A", over: Partial<q.PayDetailsInput> = {}) {
  const e = await q.createEmployee({
    name, role: "Staff", email: `${name.split(" ")[0].toLowerCase()}@example.test`, employmentType: "Full-time",
    startDate: "1 Apr 2026", taxCode: "1257L", niNumber, weeklyHours: 37.5,
  });
  await q.updateEmployeePayDetails(e.id, payDetails(over));
  return e;
}

suite("statutory pay, reliefs, directors and payments", () => {
  let co: string;
  let ids: Record<string, string>;
  beforeAll(async () => {
    signInAs("user_extras", null);
    co = await createBusiness({ name: "Extras Ltd", paySchedule: "Monthly", employeeCount: 4, sampleData: false });
    signInAs("user_extras", co);
    await records.updatePayrollSettings({
      payeReference: "123/AB45678", accountsOfficeReference: "123PA00012345", pensionScheme: "relief_at_source",
      claimEmploymentAllowance: true, smallEmployerRelief: false, bankAccountName: "Extras Ltd", bankSortCode: "65-43-21",
      bankAccountNumber: "87654321", bacsSun: "123456",
    });
    const sick = await hire("Sam Sick");
    const mum = await hire("Maya Mum");
    const dir = await hire("Dee Director", "QQ123456B", { isDirector: true, annualSalary: 60_000 });
    const nobank = await hire("Nora Nobank");
    ids = { sick: sick.id, mum: mum.id, dir: dir.id, nobank: nobank.id };
    for (const id of [sick.id, mum.id, dir.id]) {
      await records.updateEmployeeRecord(id, {
        gender: "F", addressLine1: "1 High St", addressLine2: null, postcode: "SW1A 1AA", payrollId: null, starterDeclaration: null,
        workingDays: [1, 2, 3, 4, 5], payrolledBenefitsAnnual: 0, bankAccountName: null, bankSortCode: "12-34-56", bankAccountNumber: "12345678",
      });
    }
    // Sick Mon 5 – Fri 9 Oct; maternity from 1 Oct (AWE £500)
    await records.createAbsence({ employeeId: sick.id, type: "sickness", startDate: "2026-10-05", endDate: "2026-10-09", averageWeeklyEarnings: 692.31, deductPay: true, notes: null });
    await records.createAbsence({ employeeId: mum.id, type: "maternity", startDate: "2026-10-01", endDate: "2027-06-29", averageWeeklyEarnings: 500, deductPay: true, notes: null });
  });

  it("pays SSP and docks the sick days", async () => {
    const runId = await runs.createPayRun("monthly", "2026-10-30");
    const sam = (await runs.getPayslipLines(runId)).find((l) => l.employee_name === "Sam Sick")!;
    expect(sam.statutory_pay).toBe(123.25);
    // 5 of 5 working days × £36,000 / (52 × 5) = £692.31 docked
    expect(sam.absence_deduction).toBe(692.31);
    expect(sam.gross_pay).toBeCloseTo(3000 - 692.31 + 123.25, 2);
    expect(sam.statutory_breakdown).toEqual([{ type: "sickness", payment: "SSP", days: 5, amount: 123.25 }]);
  });

  it("pays SMP for the whole of October, stops salary, and counts recovery at 92%", async () => {
    const run = (await q.getCurrentRun())!;
    const maya = (await runs.getPayslipLines(run.id)).find((l) => l.employee_name === "Maya Mum")!;
    // 31 days at £450/week = 4 weeks + 3 days → 1,800 + 192.857… → £1,992.86
    expect(maya.statutory_pay).toBe(1992.86);
    // 22 working days × £36,000 / 260 = £3,046.15 — more than the month's £3,000, so capped at basic pay
    expect(maya.absence_deduction).toBe(3000);
    const summary = (await runs.getPayRun(run.id))!;
    expect(summary.statutory_recovered).toBeCloseTo(1992.86 * 0.92, 2);
    expect(summary.total_ssp).toBe(123.25);
  });

  it("directors pay nothing in NI while under the annual thresholds", async () => {
    const run = (await q.getCurrentRun())!;
    const dee = (await runs.getPayslipLines(run.id)).find((l) => l.employee_name === "Dee Director")!;
    // £5,000 so far this year (first engine run): under the £12,570 annual PT and at the £5,000 ST
    expect(dee.employee_ni).toBe(0);
    expect(dee.employer_ni).toBe(0);
  });

  it("claims Employment Allowance against employer NI", async () => {
    const summary = (await runs.getPayRun((await q.getCurrentRun())!.id))!;
    expect(summary.employer_ni).toBeGreaterThan(0);
    expect(summary.employment_allowance_used).toBe(summary.employer_ni); // well under £10,500
  });

  it("approval posts a journal that still balances with the reliefs", async () => {
    const run = (await q.getCurrentRun())!;
    for (const l of (await q.getLinesForRun(run.id)).filter((x) => x.severity && x.severity !== "critical")) await q.resolveLine(l.id);
    expect((await q.approveRun(run.id)).journalPosted).toBe(true);
    const tb = await q.getTrialBalance();
    expect(tb.reduce((s, r) => s + r.debit, 0)).toBeCloseTo(tb.reduce((s, r) => s + r.credit, 0), 2);
  });

  it("payment file includes everyone with bank details and reports who's missing", async () => {
    const run = (await q.getCurrentRun())!;
    const res = await downloadPayments(new NextRequest(`http://test/api/payroll/runs/${run.id}/payments?format=csv`), { params: Promise.resolve({ id: run.id }) });
    const csv = await res.text();
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(4); // header + 3 payees
    expect(decodeURIComponent(res.headers.get("X-Excluded-Employees")!)).toBe("Nora Nobank");
    const std18 = await downloadPayments(new NextRequest(`http://test/x?format=std18`), { params: Promise.resolve({ id: run.id }) });
    expect((await std18.text()).split("\r\n").filter(Boolean).every((r) => r.length === 100)).toBe(true);
  });

  it("validates bank details and refuses other businesses' employees", async () => {
    await expect(records.updateEmployeeRecord(ids.nobank, {
      gender: null, addressLine1: null, addressLine2: null, postcode: null, payrollId: null, starterDeclaration: null,
      workingDays: [1], payrolledBenefitsAnnual: 0, bankAccountName: null, bankSortCode: "12345", bankAccountNumber: "12345678",
    })).rejects.toThrow(/Sort code/);
    signInAs("user_other", null);
    const other = await createBusiness({ name: "Other Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    signInAs("user_other", other);
    await expect(records.createAbsence({ employeeId: ids.sick, type: "sickness", startDate: "2026-11-02", endDate: "2026-11-03", averageWeeklyEarnings: null, deductPay: true, notes: null })).rejects.toThrow(/not found/);
    expect(await records.getAbsences(ids.sick)).toEqual([]);
    signInAs("user_extras", co);
  });
});
