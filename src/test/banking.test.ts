import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());

import { signInAs } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import * as q from "@/lib/queries";
import * as runs from "@/lib/payroll/runs";
import * as bank from "@/lib/banking/bank";
import * as L from "@/lib/ledger/reports";

const suite = TEST_DB ? describe : describe.skip;
const at = async (code: string, date = "2026-12-31") => (await L.accountBalances(null, date)).find((a) => a.code === code)!.balance;

suite("bank statements and reconciliation", () => {
  let co: string;
  let net: number;
  let invoiceNumber: string;
  beforeAll(async () => {
    signInAs("user_bank", null);
    co = await createBusiness({ name: "Bank Ltd", paySchedule: "Monthly", employeeCount: 1, sampleData: false });
    signInAs("user_bank", co);
    const inv = await q.createInvoice({ customerName: "Acme Ltd", customerEmail: null, issueDate: "2026-09-01", dueDate: "2026-09-15", vatRate: 20, notes: null, items: [{ description: "Work", quantity: 1, unitPrice: 1000 }] });
    await q.updateInvoiceStatus(inv.id, "sent");
    invoiceNumber = inv.invoice_number;
    await q.createBill({ supplierName: "Landlord Properties", category: "Rent", billDate: "2026-09-01", dueDate: "2026-09-20", total: 2000 });
    const figma = await q.createBill({ supplierName: "Figma", category: "Software", billDate: "2026-09-10", dueDate: "2026-09-10", total: 12 });
    await q.payBill(figma.id); // paid inside Verity → a recorded payment awaiting the statement
    await q.createEmployee({ name: "Pat Payee", role: "Staff", email: "pat@example.test", employmentType: "Full-time", startDate: "2026-09-01", taxCode: "1257L", niNumber: "AB123456C", weeklyHours: 37.5, annualSalary: 30000 });
    const runId = await runs.createPayRun("monthly", "2026-09-30");
    for (const l of (await q.getLinesForRun(runId)).filter((x) => x.severity && x.severity !== "critical")) await q.resolveLine(l.id);
    await q.approveRun(runId);
    net = (await runs.getPayRun(runId))!.net_pay;
  });

  const today = new Date();
  const payDay = (d: number) => `${String(d).padStart(2, "0")}/${String(today.getUTCMonth() + 1).padStart(2, "0")}/${today.getUTCFullYear()}`;
  // Figma was paid "today" inside Verity; the statement line lands the same day.
  const statement = () => {
    let bal = 10000;
    const rows: string[] = [];
    const add = (date: string, desc: string, amount: number) => {
      bal = Math.round((bal + amount) * 100) / 100;
      rows.push(`${date},FPI,'30-00-00,12345678,${desc},${amount < 0 ? (-amount).toFixed(2) : ""},${amount > 0 ? amount.toFixed(2) : ""},${bal.toFixed(2)}`);
    };
    add("16/09/2026", `ACME LTD ${"REF " + invoiceNumber}`, 1200);
    add("20/09/2026", "LANDLORD PROPERTIES RENT", -2000);
    add(payDay(today.getUTCDate()), "FIGMA SUBSCRIPTION", -12);
    add("24/09/2026", "AWS EMEA", -84.2);
    add("25/09/2026", "INTEREST PAID", 50);
    add("30/09/2026", "BACS SALARIES SEP", -net);
    return `Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance\n${rows.join("\n")}`;
  };

  it("imports a statement and skips duplicates on re-import", async () => {
    const first = await bank.importStatement("sept.csv", statement());
    expect(first).toMatchObject({ lines: 6, imported: 6, duplicates: 0, closingDate: "2026-09-30" });
    const again = await bank.importStatement("sept.csv", statement());
    expect(again).toMatchObject({ imported: 0, duplicates: 6 });
    expect(await bank.listStatementLines()).toHaveLength(6);
  });

  it("auto-reconciles confident matches, including a bank rule", async () => {
    await bank.createRule("aws", "debit", "7500");
    const result = await bank.autoReconcile();
    expect(result.reconciled).toBe(5);
    const left = await bank.listStatementLines();
    expect(left.map((l) => l.description)).toEqual(["INTEREST PAID"]);
    expect(left[0].suggestions).toEqual([]);
  });

  it("everything landed in the right place in the books", async () => {
    await bank.reconcileLine((await bank.listStatementLines())[0].id, { kind: "account", accountCode: "4900" });
    expect(await at("1100")).toBe(0); // invoice paid
    expect(await at("2100")).toBe(0); // both bills paid
    expect(await at("2220")).toBe(0); // wages paid
    expect(await at("7500")).toBe(96.2); // Figma bill + AWS
    expect(await at("4900")).toBe(50);
    expect((await q.getBills()).every((b) => b.status === "paid")).toBe(true);
    // The Figma payment recorded in Verity was confirmed, not double-counted
    expect((await bank.bankSummary()).unconfirmed).toEqual([]);
  });

  it("books agree with the statement once the opening balance is set", async () => {
    let s = await bank.bankSummary();
    expect(s.statementBalance).toBeCloseTo(10000 + 1200 - 2000 - 12 - 84.2 + 50 - net, 2);
    expect(s.difference).toBeCloseTo(10000, 2); // opening balance not in the books yet
    await bank.setOpeningBalanceFromStatement();
    s = await bank.bankSummary();
    expect(s.hasOpeningBalance).toBe(true);
    expect(s.difference).toBe(0);
    expect(s.unreconciled).toBe(0);
    const bs = await L.balanceSheet("2026-12-31");
    expect(bs.balanced).toBe(true);
  });

  it("undoing a match reverses it and reopens the invoice", async () => {
    const line = (await bank.listStatementLines("all")).find((l) => l.description.startsWith("ACME"))!;
    await bank.unreconcileLine(line.id);
    expect((await q.getInvoices())[0].status).toBe("sent");
    expect(await at("1100")).toBe(1200);
    expect((await bank.bankSummary()).difference).toBe(1200);
    await bank.reconcileLine(line.id, { kind: "invoice", id: (await q.getInvoices())[0].id });
    expect((await bank.bankSummary()).difference).toBe(0);
  });

  it("refuses mismatched amounts and other businesses' lines", async () => {
    const line = (await bank.listStatementLines("all")).find((l) => l.description.startsWith("INTEREST"))!;
    await bank.unreconcileLine(line.id);
    const inv = (await q.getInvoices())[0];
    await expect(bank.reconcileLine(line.id, { kind: "invoice", id: inv.id })).rejects.toThrow(/isn't open|doesn't match/);
    signInAs("user_other_bank", null);
    const other = await createBusiness({ name: "Other Bank Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    signInAs("user_other_bank", other);
    await expect(bank.reconcileLine(line.id, { kind: "account", accountCode: "4900" })).rejects.toThrow(/not found/);
    expect(await bank.listStatementLines("all")).toEqual([]);
  });
});
