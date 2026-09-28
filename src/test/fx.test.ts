import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

import { signInAs } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import { getPool, ready } from "@/lib/db";
import * as q from "@/lib/queries";
import * as bank from "@/lib/banking/bank";
import * as L from "@/lib/ledger/reports";
import { gbpRate } from "@/lib/fx/rates";
import { fxSummary, openForeignBalances, postRevaluation } from "@/lib/fx/revalue";
import { renderToString } from "react-dom/server";
import CurrenciesPage from "@/app/dashboard/currencies/page";

const suite = TEST_DB ? describe : describe.skip;
const at = async (code: string, date: string) => (await L.accountBalances(null, date)).find((a) => a.code === code)!.balance;

// Rates well outside the live feed's 90 days, so nothing here depends on the network.
const RATES: Record<string, Record<string, number>> = {
  "2025-03-03": { GBP: 0.84, USD: 1.1 },
  "2025-03-17": { GBP: 0.85, USD: 1.05 },
  "2025-03-31": { GBP: 0.86, USD: 1.08 },
};

suite("multi-currency", () => {
  let co: string;
  let invoiceId: string;
  let billId: string;
  beforeAll(async () => {
    await ready();
    for (const [date, rates] of Object.entries(RATES)) {
      for (const [c, r] of Object.entries(rates)) {
        await getPool().query("INSERT INTO fx_rates (rate_date, currency, per_eur) VALUES ($1, $2, $3) ON CONFLICT (rate_date, currency) DO UPDATE SET per_eur = EXCLUDED.per_eur", [date, c, r]);
      }
    }
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
    signInAs("user_fx", null);
    co = await createBusiness({ name: "Global Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    signInAs("user_fx", co);
  });
  afterAll(() => vi.unstubAllGlobals());

  it("crosses ECB rates to sterling, including dollar-pegged currencies and weekends", async () => {
    expect((await gbpRate("USD", "2025-03-03")).rate).toBe(0.763636); // 0.84 / 1.10
    expect((await gbpRate("EUR", "2025-03-03")).rate).toBe(0.84);
    expect((await gbpRate("AED", "2025-03-03")).rate).toBe(0.207934); // 0.84 / (1.10 × 3.6725)
    expect(await gbpRate("USD", "2025-03-08")).toMatchObject({ rate: 0.763636, date: "2025-03-03" }); // Saturday
    expect((await gbpRate("GBP", "2025-03-03")).rate).toBe(1);
    await expect(gbpRate("XYZ", "2025-03-03")).rejects.toThrow(/isn't a currency/);
    await expect(gbpRate("USD", "2019-01-01")).rejects.toThrow(/No exchange rate/);
  });

  it("books foreign invoices and bills at the rate on their date", async () => {
    const inv = await q.createInvoice({ customerName: "Acme Inc", customerEmail: null, issueDate: "2025-03-03", dueDate: "2025-04-02", vatRate: 20, notes: null, currency: "USD", items: [{ description: "Consulting", quantity: 1, unitPrice: 1000 }] });
    expect(inv).toMatchObject({ currency: "USD", original_total: 1200, fx_rate: 0.763636, subtotal: 763.64, vat_amount: 152.73, total: 916.37 }); // the sum of the converted parts
    await q.updateInvoiceStatus(inv.id, "sent");
    invoiceId = inv.id;
    const bill = await q.createBill({ supplierName: "Berlin GmbH", category: "Software", billDate: "2025-03-03", dueDate: "2025-04-02", total: 500, currency: "EUR" });
    expect(bill).toMatchObject({ currency: "EUR", original_total: 500, total: 420 });
    billId = bill.id;
    expect(await at("1100", "2025-03-03")).toBe(916.37);
    expect(await at("2100", "2025-03-03")).toBe(420);
  });

  it("revalues open balances at a date and reverses the next day", async () => {
    const open = await openForeignBalances("2025-03-17");
    expect(open.map((o) => [o.reference.slice(0, 3), o.current, o.difference])).toEqual([
      ["INV", 971.43, 55.06], // $1,200 at 0.809524 — worth more
      ["BIL", 425, -5], // €500 at 0.85 — costs more
    ]);
    expect(await postRevaluation("2025-03-17")).toBe(50.06);
    await expect(postRevaluation("2025-03-17")).rejects.toThrow(/already revalued/);
    expect(await at("1100", "2025-03-17")).toBe(971.43);
    expect(await at("2100", "2025-03-17")).toBe(425);
    expect(await at("7950", "2025-03-17")).toBe(-50.06); // a credit on a cost account is a gain
    expect(await at("1100", "2025-03-18")).toBe(916.37);
    expect(await at("7950", "2025-03-18")).toBe(0);
    expect((await fxSummary("2025-01-01")).revaluations).toEqual([{ date: "2025-03-17", net: 50.06 }]);
  });

  it("books the realised gain when the customer pays, and undoes it with the match", async () => {
    const csv = `Date,Description,Amount\n31/03/2025,ACME INC ${(await q.getInvoices()).find((i) => i.id === invoiceId)!.invoice_number},950.00`;
    await bank.importStatement("usd.csv", csv);
    const line = (await bank.listStatementLines()).find((l) => l.amount === 950)!;
    expect(line.suggestions[0]).toMatchObject({ kind: "invoice", id: invoiceId, confidence: "high" });
    await bank.reconcileLine(line.id, { kind: "invoice", id: invoiceId });
    expect(await at("1100", "2025-03-31")).toBe(0);
    expect(await at("1200", "2025-03-31")).toBe(950);
    expect(await at("7950", "2025-03-31")).toBe(-33.63); // received £950 for £916.37 booked
    expect((await fxSummary("2025-01-01")).realisedGains).toBe(33.63);

    // Undoing reverses the payment as of today, so read the books after that.
    await bank.unreconcileLine(line.id);
    expect(await at("1100", "2099-12-31")).toBe(916.37);
    expect(await at("7950", "2099-12-31")).toBe(0);
    await expect(bank.reconcileLine(line.id, { kind: "invoice", id: invoiceId })).resolves.toBeUndefined();
  });

  it("pays a foreign bill at today's rate and corrects it to what the bank actually charged", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const rate = (await gbpRate("EUR", today)).rate;
    const expected = Math.round(500 * rate * 100) / 100;
    await q.payBill(billId);
    const { rows } = await getPool().query("SELECT id, amount FROM bank_transactions WHERE matched_bill_id = $1", [billId]);
    expect(rows[0].amount).toBe(expected);
    expect(await at("7950", "2099-12-31")).toBeCloseTo(-33.63 + (expected - 420), 2);

    // The statement shows the bank's own conversion, a little different.
    const charged = Math.round((expected + 1.5) * 100) / 100;
    const d = today.split("-").reverse().join("/");
    await bank.importStatement("eur.csv", `Date,Description,Amount\n${d},BERLIN GMBH SEPA,-${charged.toFixed(2)}`);
    const line = (await bank.listStatementLines()).find((l) => l.description.startsWith("BERLIN"))!;
    expect(line.suggestions[0]).toMatchObject({ kind: "recorded", id: rows[0].id });
    await bank.reconcileLine(line.id, { kind: "recorded", id: rows[0].id });
    expect(await at("1200", "2099-12-31")).toBeCloseTo(950 - charged, 2);
    expect(await at("7950", "2099-12-31")).toBeCloseTo(-33.63 + (charged - 420), 2);
    expect(await at("2100", "2099-12-31")).toBe(0);

    // Books still balance.
    const all = await L.accountBalances(null, "2099-12-31");
    const dr = all.reduce((s, a) => s + a.debit, 0);
    const cr = all.reduce((s, a) => s + a.credit, 0);
    expect(Math.round(dr * 100)).toBe(Math.round(cr * 100));
  });

  it("keeps sterling matching exact", async () => {
    const inv = await q.createInvoice({ customerName: "Local Ltd", customerEmail: null, issueDate: "2025-03-03", dueDate: "2025-03-10", vatRate: 0, notes: null, items: [{ description: "Work", quantity: 1, unitPrice: 100 }] });
    await q.updateInvoiceStatus(inv.id, "sent");
    await bank.importStatement("gbp.csv", "Date,Description,Amount\n10/03/2025,LOCAL LTD,101.00");
    const line = (await bank.listStatementLines()).find((l) => l.description === "LOCAL LTD")!;
    expect(line.suggestions.filter((s) => s.kind === "invoice")).toEqual([]);
    await expect(bank.reconcileLine(line.id, { kind: "invoice", id: inv.id })).rejects.toThrow(/doesn't match/);
  });

  it("renders the currencies page", async () => {
    const html = renderToString(await CurrenciesPage());
    expect(html).toContain("Open foreign balances");
    expect(html).toContain("Realised this year");
  });
});
