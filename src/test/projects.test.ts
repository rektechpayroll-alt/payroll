import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {}, push() {} }), notFound: () => { throw new Error("NOT_FOUND"); } }));

import { renderToString } from "react-dom/server";
import { signInAs } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import { getPool } from "@/lib/db";
import * as q from "@/lib/queries";
import * as P from "@/lib/projects/service";
import ProjectsPage from "@/app/dashboard/projects/page";
import ProjectPage from "@/app/dashboard/projects/[id]/page";

const suite = TEST_DB ? describe : describe.skip;
const base = { name: "Website rebuild", clientName: "Acme Ltd", billing: "hourly" as const, hourlyRate: 90, fixedPrice: null, budget: 2000, startDate: "2026-09-01", dueDate: null };

suite("projects", () => {
  let co: string;
  let other: string;
  let ann: string;
  let hourly: string;
  beforeAll(async () => {
    signInAs("user_proj", null);
    other = await createBusiness({ name: "Other Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    co = await createBusiness({ name: "Studio Ltd", paySchedule: "Monthly", employeeCount: 1, sampleData: false });
    signInAs("user_proj", co);
    ann = (await q.createEmployee({ name: "Ann Designer", role: "Designer", email: "ann@example.test", employmentType: "Full-time", startDate: "2026-01-01", taxCode: "1257L", niNumber: "AB123456C", weeklyHours: 37.5, annualSalary: 39000 })).id;
  });

  it("validates and creates projects", async () => {
    await expect(P.createProject({ ...base, hourlyRate: 0 })).rejects.toThrow(/hourly rate/);
    await expect(P.createProject({ ...base, billing: "fixed" })).rejects.toThrow(/fixed price/);
    hourly = await P.createProject(base);
    expect((await P.getProject(hourly)).project).toMatchObject({ billing: "hourly", hourly_rate: 90, status: "active" });
  });

  it("costs time at the person's real cost and bills it at the project rate", async () => {
    await P.logTime({ projectId: hourly, employeeId: ann, date: "2026-09-10", hours: 10, billable: true, note: "Design" });
    await P.logTime({ projectId: hourly, employeeId: ann, date: "2026-09-11", hours: 2, billable: false, note: "Internal review" });
    await expect(P.logTime({ projectId: hourly, employeeId: ann, date: "2026-09-11", hours: 30, billable: true, note: null })).rejects.toThrow(/between 0 and 24/);
    await P.addCost({ projectId: hourly, date: "2026-09-12", description: "Stock photos", amount: 100, billable: true, markupPct: 20 });
    // A bill and an approved expense claim charged to the project count as costs (net of VAT).
    await q.createBill({ supplierName: "Hosting Co", category: "Software", billDate: "2026-09-12", dueDate: "2026-10-12", total: 120, vatRate: 20, projectId: hourly });
    const claim = await q.createExpenseClaim({ employeeId: ann, description: "Train to client", category: "Travel", amount: 60, expenseDate: "2026-09-13", projectId: hourly });
    await q.updateExpenseClaimStatus(claim.id, "approved");

    const d = await P.getProject(hourly);
    expect(d.entries.map((e) => e.cost_rate)).toEqual([23.12, 23.12]);
    expect(d.costs.map((c) => [c.source, c.amount])).toEqual(expect.arrayContaining([["cost", 100], ["bill", 100], ["claim", 60]]));
    expect(d.financials).toMatchObject({ hours: 12, billableHours: 10, timeCost: 277.44, otherCosts: 260, totalCost: 537.44, unbilled: 1020, invoiced: 0 });
  });

  it("invoices unbilled work once, and frees it again if the invoice is voided", async () => {
    const inv = await P.invoiceProject({ projectId: hourly, vatRate: 20 });
    const invoice = (await q.getInvoices()).find((i) => i.id === inv.id)!;
    expect(invoice).toMatchObject({ customer_name: "Acme Ltd", subtotal: 1020, total: 1224, status: "draft" });
    const { rows: items } = await getPool().query("SELECT description, quantity, unit_price FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order", [inv.id]);
    expect(items).toEqual([
      { description: "Website rebuild — Ann Designer, 10 hours", quantity: 10, unit_price: 90 },
      { description: "Stock photos (incl. 20% handling)", quantity: 1, unit_price: 120 },
    ]);
    await expect(P.invoiceProject({ projectId: hourly })).rejects.toThrow(/no unbilled/);
    await expect(P.deleteTime((await P.getProject(hourly)).entries.find((e) => e.billable)!.id)).rejects.toThrow(/void the invoice first/);

    await q.updateInvoiceStatus(inv.id, "sent");
    const sent = await P.getProject(hourly);
    expect(sent.financials).toMatchObject({ invoiced: 1020, unbilled: 0, profit: 482.56 });

    await q.updateInvoiceStatus(inv.id, "void");
    expect((await P.getProject(hourly)).financials).toMatchObject({ invoiced: 0, unbilled: 1020 });
  });

  it("bills fixed-price projects in stages up to the price", async () => {
    const fixed = await P.createProject({ ...base, name: "Brand identity", billing: "fixed", fixedPrice: 5000, budget: 3000 });
    await P.logTime({ projectId: fixed, employeeId: ann, date: "2026-09-15", hours: 8, billable: true, note: null });
    expect((await P.getProject(fixed)).entries[0].billable).toBe(false); // time on fixed-price work isn't billed by the hour
    const deposit = await P.invoiceProject({ projectId: fixed, amount: 1500, description: "Deposit 30%" });
    await q.updateInvoiceStatus(deposit.id, "sent");
    await expect(P.invoiceProject({ projectId: fixed, amount: 4000 })).rejects.toThrow(/Only 3500.00/);
    const f = (await P.getProject(fixed)).financials;
    expect(f).toMatchObject({ invoiced: 1500, leftToInvoice: 3500, expectedRevenue: 5000, timeCost: 184.96 });
  });

  it("keeps projects to their own business", async () => {
    signInAs("user_proj", other);
    await expect(P.getProject(hourly)).rejects.toThrow(/doesn't exist/);
    await expect(q.createBill({ supplierName: "X", category: null, billDate: "2026-09-01", dueDate: "2026-09-30", total: 10, projectId: hourly })).rejects.toThrow(/doesn't exist/);
    expect(await P.listProjects()).toEqual([]);
    signInAs("user_proj", co);
  });

  it("renders the list and detail pages", async () => {
    expect(renderToString(await ProjectsPage())).toContain("Website rebuild");
    const html = renderToString(await ProjectPage({ params: Promise.resolve({ id: hourly }) }));
    expect(html).toContain("Invoice the client");
    expect(html).toContain("Ann Designer");
    await expect(ProjectPage({ params: Promise.resolve({ id: "nope" }) })).rejects.toThrow("NOT_FOUND");
  });
});
