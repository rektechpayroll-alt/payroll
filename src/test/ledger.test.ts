import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());

import { signInAs } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import { getPool } from "@/lib/db";
import * as q from "@/lib/queries";
import * as L from "@/lib/ledger/reports";

const suite = TEST_DB ? describe : describe.skip;
const today = new Date().toISOString().slice(0, 10);
const bal = async (code: string) => (await L.accountBalances(null, today)).find((a) => a.code === code)!.balance;

async function activeJournals(companyId: string, sourceType: string) {
  const { rows } = await getPool().query(
    "SELECT * FROM gl_journals WHERE company_id = $1 AND source_type = $2 AND reversed_by IS NULL AND reverses IS NULL",
    [companyId, sourceType]
  );
  return rows;
}

async function expectBalancedBooks() {
  const tb = await q.getTrialBalance();
  expect(tb.reduce((s, r) => s + r.debit, 0)).toBeCloseTo(tb.reduce((s, r) => s + r.credit, 0), 2);
  const bs = await L.balanceSheet(today);
  expect(bs.balanced).toBe(true);
  return bs;
}

suite("the full ledger", () => {
  let sample: string;
  let co: string;
  beforeAll(async () => {
    signInAs("user_sample_books", null);
    sample = await createBusiness({ name: "Sample Books Ltd", paySchedule: "Monthly", employeeCount: 15, sampleData: true });
    signInAs("user_books", null);
    co = await createBusiness({ name: "Books Ltd", paySchedule: "Monthly", employeeCount: 1, sampleData: false });
  });

  it("backfills a sample business into balanced books", async () => {
    signInAs("user_sample_books", sample);
    const bs = await expectBalancedBooks();
    expect(bs.totalAssets).not.toBe(0);
    // every sent/paid invoice is in sales
    const invoices = await q.getInvoices();
    const salesExpected = invoices.filter((i) => i.status === "sent" || i.status === "paid").reduce((s, i) => s + i.subtotal, 0);
    expect(await bal("4000")).toBeCloseTo(salesExpected, 2);
    // outstanding invoices are exactly what's in debtors
    expect(await bal("1100")).toBeCloseTo(invoices.filter((i) => i.status === "sent").reduce((s, i) => s + i.total, 0), 2);
    expect((await activeJournals(sample, "depreciation")).length).toBeGreaterThan(10);
  });

  it("invoices post when sent, get paid, and reverse cleanly when unmatched or voided", async () => {
    signInAs("user_books", co);
    const inv = await q.createInvoice({
      customerName: "Acme Ltd", customerEmail: null, issueDate: "2026-09-01", dueDate: "2026-09-15", vatRate: 20, notes: null,
      items: [{ description: "Consulting", quantity: 10, unitPrice: 100 }],
    });
    expect(await activeJournals(co, "invoice")).toHaveLength(0); // drafts aren't in the books
    await q.updateInvoiceStatus(inv.id, "sent");
    expect(await bal("1100")).toBe(1200);
    expect(await bal("4000")).toBe(1000);
    expect(await bal("2200")).toBe(200);

    await q.payInvoiceByCard(inv.id);
    expect(await bal("1100")).toBe(0);
    expect(await bal("1200")).toBe(1200);

    const txn = (await q.getBankTransactions()).find((t) => t.matched_invoice_id === inv.id)!;
    await q.unmatchTransaction(txn.id);
    expect(await bal("1100")).toBe(1200); // back to owed
    expect(await bal("1200")).toBe(0);
    expect(await activeJournals(co, "invoice_payment")).toHaveLength(0);

    await q.updateInvoiceStatus(inv.id, "void");
    expect(await bal("1100")).toBe(0);
    expect(await bal("4000")).toBe(0);
    // nothing deleted: original + reversal both kept
    const { rows } = await getPool().query("SELECT COUNT(*)::int AS n FROM gl_journals WHERE company_id = $1 AND source_id = $2", [co, inv.id]);
    expect(rows[0].n).toBe(4); // invoice, payment, payment reversal, invoice reversal
    await expectBalancedBooks();
  });

  it("bills hit the right expense account and clear creditors when paid", async () => {
    signInAs("user_books", co);
    const bill = await q.createBill({ supplierName: "Landlord Ltd", category: "Office rent", billDate: "2026-09-01", dueDate: "2026-09-30", total: 2000 });
    expect(await bal("7100")).toBe(2000);
    expect(await bal("2100")).toBe(2000);
    await q.payBill(bill.id);
    expect(await bal("2100")).toBe(0);
    expect(await bal("1200")).toBe(-2000);
    await expectBalancedBooks();
  });

  it("expense and mileage claims accrue on approval and clear on reimbursement", async () => {
    signInAs("user_books", co);
    const e = await q.createEmployee({ name: "Eve Evans", role: "Sales", email: "eve@example.test", employmentType: "Full-time", startDate: "1 Apr 2026", taxCode: "1257L", niNumber: "AB123456C", weeklyHours: 37.5 });
    const claim = await q.createExpenseClaim({ employeeId: e.id, description: "Train to client", category: "Travel", amount: 85.5, expenseDate: "2026-09-10" });
    await q.updateExpenseClaimStatus(claim.id, "approved");
    expect(await bal("7400")).toBe(85.5);
    expect(await bal("2250")).toBe(85.5);
    await q.updateExpenseClaimStatus(claim.id, "reimbursed");
    expect(await bal("2250")).toBe(0);
    const trip = await q.createMileageClaim({ employeeId: e.id, tripDate: "2026-09-11", from: "Office", to: "Client", miles: 20 });
    await q.updateMileageClaimStatus(trip.id, "approved");
    expect(await bal("7400")).toBe(85.5 + 9);
    await expectBalancedBooks();
  });

  it("fixed assets capitalise and depreciate monthly", async () => {
    signInAs("user_books", co);
    await q.createFixedAsset({ name: "Laptop", category: "IT", purchaseDate: "2026-01-15", purchaseCost: 1200, usefulLifeYears: 1 });
    expect(await bal("0010")).toBe(1200);
    // £100/month from January to the end of last month
    const months = Number(today.slice(5, 7)) - 1;
    expect(await bal("0011")).toBe(-100 * months);
    expect(await bal("8000")).toBe(100 * months);
    await expectBalancedBooks();
  });

  it("P&L for the month reflects what happened", async () => {
    signInAs("user_books", co);
    const pl = await L.profitAndLoss("2026-09-01", "2026-09-30");
    expect(pl.totalIncome).toBe(0); // the only invoice was voided
    expect(pl.expenses.find((a) => a.code === "7100")!.balance).toBe(2000);
    expect(pl.netProfit).toBe(-pl.totalExpenses);
  });

  it("manual journals must balance, use real accounts, and can be reversed", async () => {
    signInAs("user_books", co);
    await expect(L.createManualJournal({ date: "2026-09-01", narration: "x", lines: [{ accountCode: "1200", description: "", debit: 10, credit: 0 }, { accountCode: "3000", description: "", debit: 0, credit: 9 }] })).rejects.toThrow(/must be equal/);
    await expect(L.createManualJournal({ date: "2026-09-01", narration: "x", lines: [{ accountCode: "9999", description: "", debit: 10, credit: 0 }, { accountCode: "3000", description: "", debit: 0, credit: 10 }] })).rejects.toThrow(/isn't in your chart/);
    const before = await bal("1200");
    const id = await L.createManualJournal({ date: "2026-09-01", narration: "Owner capital", lines: [{ accountCode: "1200", description: "", debit: 5000, credit: 0 }, { accountCode: "3000", description: "", debit: 0, credit: 5000 }] });
    expect(await bal("1200")).toBe(before + 5000);
    await L.reverseManualJournal(id);
    expect(await bal("1200")).toBe(before);
    await expect(L.reverseManualJournal(id)).rejects.toThrow(/already been reversed/);
    const auto = (await activeJournals(co, "bill"))[0];
    await expect(L.reverseManualJournal(auto.id)).rejects.toThrow(/Only manual journals/);
  });

  it("aged receivables bucket outstanding invoices by days overdue", async () => {
    signInAs("user_books", co);
    const inv = await q.createInvoice({ customerName: "Late Payer", customerEmail: null, issueDate: "2026-06-01", dueDate: "2026-07-01", vatRate: 0, notes: null, items: [{ description: "Work", quantity: 1, unitPrice: 500 }] });
    await q.updateInvoiceStatus(inv.id, "sent");
    const r = await L.aged("receivables", "2026-09-28");
    const row = r.rows.find((x) => x.reference === inv.invoice_number)!;
    expect(row.daysOverdue).toBe(89);
    expect(row.bucket).toBe("61-90");
    expect(r.totals["61-90"]).toBe(500);
  });

  it("other businesses can't see or reverse these journals", async () => {
    signInAs("user_books", co);
    const id = await L.createManualJournal({ date: "2026-09-02", narration: "Private", lines: [{ accountCode: "1200", description: "", debit: 1, credit: 0 }, { accountCode: "3000", description: "", debit: 0, credit: 1 }] });
    signInAs("user_sample_books", sample);
    await expect(L.reverseManualJournal(id)).rejects.toThrow(/not found/);
    expect((await q.getJournals()).some((j) => j.id === id)).toBe(false);
  });
});

suite("wages paid", () => {
  it("clears net wages payable against the bank on payday", async () => {
    const runs = await import("@/lib/payroll/runs");
    signInAs("user_wages", null);
    const co = await createBusiness({ name: "Wages Ltd", paySchedule: "Monthly", employeeCount: 1, sampleData: false });
    signInAs("user_wages", co);
    const e = await q.createEmployee({ name: "Will Wages", role: "Staff", email: "will@example.test", employmentType: "Full-time", startDate: "2026-09-01", taxCode: "1257L", niNumber: "AB123456C", weeklyHours: 37.5, annualSalary: 30000 });
    void e;
    const runId = await runs.createPayRun("monthly", "2026-09-30");
    for (const l of (await q.getLinesForRun(runId)).filter((x) => x.severity && x.severity !== "critical")) await q.resolveLine(l.id);
    await q.approveRun(runId);
    const net = (await runs.getPayRun(runId))!.net_pay;
    // Payroll journals are dated on payday, so read the books as at the end of the year.
    const at = async (code: string) => (await L.accountBalances(null, "2026-12-31")).find((a) => a.code === code)!.balance;
    expect(await at("2220")).toBeCloseTo(net, 2);
    await L.recordWagesPaid(runId);
    await L.recordWagesPaid(runId); // idempotent
    expect(await at("2220")).toBe(0);
    expect(await at("1200")).toBeCloseTo(-net, 2);
    expect((await runs.getPayRun(runId))!.wages_paid_at).toBe("2026-09-30");
  });
});
