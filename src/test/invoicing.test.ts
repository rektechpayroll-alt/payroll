import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());

import { NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { signInAs } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import * as q from "@/lib/queries";
import * as inv from "@/lib/invoicing/service";
import { GET as cron } from "@/app/api/cron/daily/route";

const suite = TEST_DB ? describe : describe.skip;

describe("recurring schedule", () => {
  it("keeps month-end invoices on the month end", () => {
    let d = "2026-01-31";
    const seen = [d];
    for (let i = 0; i < 4; i++) seen.push((d = inv.advance(d, "monthly", 31)));
    expect(seen).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(inv.advance("2026-02-28", "quarterly", 31)).toBe("2026-05-31");
    expect(inv.advance("2024-02-29", "yearly", 29)).toBe("2025-02-28");
    expect(inv.advance("2026-09-28", "weekly")).toBe("2026-10-05");
  });
});

suite("invoicing", () => {
  let co: string;
  beforeAll(async () => {
    signInAs("user_inv", null);
    co = await createBusiness({ name: "Invoicing Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    signInAs("user_inv", co);
    await inv.updateCompanyProfile({
      name: "Invoicing Ltd", address_line1: "1 High Street", address_line2: null, city: "London", postcode: "sw1a 1aa", contact_email: "accounts@invoicing.example",
      phone: "020 7946 0000", company_number: "12345678", payment_terms_days: 14, reminders_enabled: true, reminder_days: "14, 1, 7",
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("saves the business profile, tidied", async () => {
    const p = await inv.getCompanyProfile();
    expect(p).toMatchObject({ postcode: "SW1A 1AA", reminder_days: "1,7,14", payment_terms_days: 14 });
    await expect(inv.updateCompanyProfile({ ...p, company_number: "123" })).rejects.toThrow(/Companies House/);
  });

  it("renders a real PDF", async () => {
    const i = await q.createInvoice({ customerName: "Zoë & Co", customerEmail: "zoe@client.example", issueDate: "2026-09-01", dueDate: "2026-09-15", vatRate: 20, notes: "Thanks — see you next month", items: [{ description: "Design work, including a long description that has to wrap across more than one line on the page", quantity: 3, unitPrice: 450 }] });
    const { bytes } = await inv.invoicePdf(i.id);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe(`Invoice ${i.invoice_number}`);
  });

  it("won't email without email set up, then emails the PDF and marks it sent", async () => {
    const i = (await q.getInvoices()).find((x) => x.customer_name === "Zoë & Co")!;
    await expect(inv.emailInvoice(i.id)).rejects.toThrow(/Email isn't set up/);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "Invoicing Ltd <billing@invoicing.example>");
    const sent: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ id: "email_1" }));
    }));
    await inv.emailInvoice(i.id);
    expect(sent[0]).toMatchObject({ to: ["zoe@client.example"], subject: `Invoice ${i.invoice_number} from Invoicing Ltd`, reply_to: "accounts@invoicing.example" });
    const att = (sent[0].attachments as Array<{ filename: string; content: string }>)[0];
    expect(att.filename).toBe(`${i.invoice_number}.pdf`);
    expect(att.content.startsWith("JVBERi0")).toBe(true); // base64 of "%PDF-"
    expect((await q.getInvoiceById(i.id))!.status).toBe("sent");
    expect((await inv.emailLog(i.id))[0]).toMatchObject({ kind: "invoice", status: "sent", recipient: "zoe@client.example" });
  });

  it("sends only the latest reminder step, once", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "billing@invoicing.example");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "email_r" }))));
    const i = (await q.getInvoices()).find((x) => x.customer_name === "Zoë & Co")!; // due 2026-09-15
    expect(await inv.remindersDue("2026-09-15")).toEqual([]); // not overdue yet (first step is day 1)
    const due = await inv.remindersDue("2026-09-24"); // 9 days overdue → step 7
    expect(due).toMatchObject([{ invoiceId: i.id, step: 7, daysOverdue: 9 }]);
    await inv.sendReminder(i.id, 7, "2026-09-24");
    expect(await inv.remindersDue("2026-09-25")).toEqual([]);
    expect((await inv.remindersDue("2026-09-30"))[0].step).toBe(14);
  });

  it("raises recurring invoices, catching up missed months, and never twice", async () => {
    await inv.createRecurring({
      customer_name: "Retainer Client", customer_email: null, items: [{ description: "Monthly retainer", quantity: 1, unitPrice: 1000 }], vat_rate: 20,
      currency: "GBP", frequency: "monthly", next_date: "2026-01-31", end_date: null, due_days: 14, auto_send: false, notes: null,
    });
    const r = await inv.generateRecurring("2026-04-30");
    expect(r.created).toBe(4);
    expect((await inv.generateRecurring("2026-04-30")).created).toBe(0);
    const made = (await q.getInvoices()).filter((x) => x.customer_name === "Retainer Client").map((x) => x.issue_date).sort();
    expect(made).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect((await inv.listRecurring())[0].next_date).toBe("2026-05-31");
    await expect(inv.createRecurring({ customer_name: "X", customer_email: null, items: [], vat_rate: 20, currency: "GBP", frequency: "monthly", next_date: "2026-01-01", end_date: null, due_days: 14, auto_send: false, notes: null })).rejects.toThrow(/at least one line/);
  });

  it("the daily job works business by business, and needs the cron secret", async () => {
    signInAs("user_inv2", null);
    const other = await createBusiness({ name: "Other Invoicing Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    signInAs("user_inv2", other);
    await inv.createRecurring({
      customer_name: "Other's Client", customer_email: "client@other.example", items: [{ description: "Service", quantity: 1, unitPrice: 50 }], vat_rate: 0,
      currency: "GBP", frequency: "weekly", next_date: "2026-09-21", end_date: null, due_days: 7, auto_send: true, notes: null,
    });
    const summary = await inv.runDailyJobs("2026-09-28");
    expect(summary.find((s) => s.companyId === other)!.created).toBe(2);
    expect(summary.find((s) => s.companyId === co)!.created).toBe(4); // 31 May, 30 Jun, 31 Jul, 31 Aug (30 Sep not yet due)
    // Each business only sees its own invoices
    expect((await q.getInvoices()).every((x) => x.customer_name === "Other's Client")).toBe(true);
    expect((await q.getInvoices()).every((x) => x.status === "sent")).toBe(true); // auto-send without email = marked sent
    signInAs("user_inv", co);
    expect((await q.getInvoices()).some((x) => x.customer_name === "Other's Client")).toBe(false);

    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await cron(new NextRequest("http://x/api/cron/daily"))).status).toBe(401);
    expect((await cron(new NextRequest("http://x/api/cron/daily", { headers: { authorization: "Bearer wrong!" } }))).status).toBe(401);
    expect((await cron(new NextRequest("http://x/api/cron/daily", { headers: { authorization: "Bearer s3cret" } }))).status).toBe(200);
  });
});
