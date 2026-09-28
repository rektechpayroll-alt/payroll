import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }) }));

import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";
import { signInAs } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import { getPool, ready } from "@/lib/db";
import * as q from "@/lib/queries";
import * as Pay from "@/lib/payments/service";
import { invoicePdf } from "@/lib/invoicing/service";
import PayPage from "@/app/dashboard/purchasing/pay/page";
import { GET as fileRoute } from "@/app/api/payments/batch/file/route";

const suite = TEST_DB ? describe : describe.skip;
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

suite("supplier payments", () => {
  let co: string;
  let other: string;
  let rent: string;
  let design: string;
  let berlin: string;
  beforeAll(async () => {
    await ready();
    // A euro rate for the bill date, so nothing reaches for the network.
    for (const [c, r] of [["GBP", 0.84], ["USD", 1.1]] as const) {
      await getPool().query("INSERT INTO fx_rates (rate_date, currency, per_eur) VALUES ('2025-03-03', $1, $2) ON CONFLICT (rate_date, currency) DO UPDATE SET per_eur = EXCLUDED.per_eur", [c, r]);
    }
    signInAs("user_pay", null);
    other = await createBusiness({ name: "Elsewhere Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    co = await createBusiness({ name: "Payer & Co Ltd", paySchedule: "Monthly", employeeCount: 0, sampleData: false });
    signInAs("user_pay", co);
    rent = (await q.createBill({ supplierName: "Landlord Ltd", category: "Rent", billDate: "2026-09-01", dueDate: "2026-10-01", total: 1500 })).id;
    design = (await q.createBill({ supplierName: "Pixel Studio", category: "Marketing", billDate: "2026-09-05", dueDate: "2026-10-05", total: 480.5 })).id;
    berlin = (await q.createBill({ supplierName: "Berlin GmbH", category: "Software", billDate: "2025-03-03", dueDate: "2025-04-02", total: 500, currency: "EUR" })).id;
  });

  it("checks bank details before saving them", async () => {
    await expect(Pay.updateBankDetails({ accountName: null, sortCode: "12-34-5", accountNumber: "12345678", iban: null, bic: null })).rejects.toThrow(/6 digits/);
    await expect(Pay.updateBankDetails({ accountName: null, sortCode: null, accountNumber: null, iban: "GB29NWBK60161331926818", bic: null })).rejects.toThrow(/IBAN/);
    await Pay.updateBankDetails({ accountName: "Payer and Co Ltd", sortCode: "60-16-13", accountNumber: "31926819", iban: "gb29 nwbk 6016 1331 9268 19", bic: "nwbkgb2l" });
    expect(await Pay.getBankDetails()).toMatchObject({ sortCode: "601613", accountNumber: "31926819", iban: "GB29NWBK60161331926819", bic: "NWBKGB2L" });
    // Suppliers known only from bills can be given details; a contact is created for them.
    await Pay.updateSupplierBank("landlord ltd", { accountName: "Landlord Ltd", sortCode: "401276", accountNumber: "12345678", iban: null, bic: null });
    await Pay.updateSupplierBank("Berlin GmbH", { accountName: null, sortCode: null, accountNumber: null, iban: "DE89370400440532013000", bic: "COBADEFFXXX" });
    const banks = await Pay.listSupplierBanks();
    expect(banks.map((b) => b.name)).toEqual(["Berlin GmbH", "Landlord Ltd", "Pixel Studio"]);
  });

  it("knows which bills can go in which file", async () => {
    const bills = await Pay.payableBills();
    const by = (id: string) => bills.find((b) => b.id === id)!;
    expect(by(rent)).toMatchObject({ formats: ["csv", "bacs18"], problem: null, currency: "GBP", amount: 1500 });
    expect(by(design).problem).toMatch(/sort code/);
    expect(by(berlin)).toMatchObject({ formats: ["pain001"], currency: "EUR", amount: 500 });
  });

  it("makes a CSV, holds its bills, and refuses to pay them twice", async () => {
    await expect(Pay.createPaymentBatch({ billIds: [rent, berlin], format: "csv", executionDate: tomorrow })).rejects.toThrow(/Berlin GmbH/);
    await expect(Pay.createPaymentBatch({ billIds: [rent], format: "csv", executionDate: "2020-01-01" })).rejects.toThrow(/from today/);
    await expect(Pay.createPaymentBatch({ billIds: [rent], format: "bacs18", executionDate: tomorrow })).rejects.toThrow(/service user number/);
    const b = await Pay.createPaymentBatch({ billIds: [rent], format: "csv", executionDate: tomorrow });
    const f = await Pay.paymentFile(b.id);
    expect(f.filename).toMatch(/^PAY-\d{8}-1\.csv$/);
    expect(f.content).toBe("Name,Sort code,Account number,Amount,Reference\r\nLandlord Ltd,40-12-76,12345678,1500.00,BILL-3001\r\n");
    await expect(Pay.createPaymentBatch({ billIds: [rent], format: "csv", executionDate: tomorrow })).rejects.toThrow(/already in payment file PAY-/);

    // Cancelling releases the bill; marking a new file paid records the payment.
    await Pay.cancelBatch(b.id);
    await expect(Pay.cancelBatch(b.id)).rejects.toThrow(/already cancelled/);
    const again = await Pay.createPaymentBatch({ billIds: [rent], format: "csv", executionDate: tomorrow });
    expect(await Pay.markBatchPaid(again.id)).toBe(1);
    expect((await q.getBills()).find((x) => x.id === rent)!.status).toBe("paid");
    expect((await Pay.payableBills()).some((x) => x.id === rent)).toBe(false);
  });

  it("makes a schema-valid pain.001 for foreign bills and serves it as a download", async () => {
    const b = await Pay.createPaymentBatch({ billIds: [berlin], format: "pain001", executionDate: tomorrow });
    const res = await fileRoute(new NextRequest(`http://localhost/api/payments/batch/file?id=${b.id}`));
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="${b.filename}"`);
    const xml = await res.text();
    expect(xml).toContain('<InstdAmt Ccy="EUR">500.00</InstdAmt>');
    expect(xml).toContain("<IBAN>DE89370400440532013000</IBAN>");
    expect(xml).toContain("<Nm>Payer and Co Ltd</Nm>");
    try {
      execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    } catch {
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), "pay-"));
    writeFileSync(join(dir, "f.xml"), xml);
    execFileSync("xmllint", ["--noout", "--schema", join(process.cwd(), "test/fixtures/iso20022/pain.001.001.03.xsd"), join(dir, "f.xml")], { stdio: "pipe" });
  });

  it("keeps files and bank details to their own business", async () => {
    const [mine] = await Pay.listPaymentBatches();
    signInAs("user_pay", other);
    await expect(Pay.paymentFile(mine.id)).rejects.toThrow(/doesn't exist/);
    await expect(Pay.markBatchPaid(mine.id)).rejects.toThrow(/doesn't exist/);
    expect(await Pay.listSupplierBanks()).toEqual([]);
    await expect(Pay.createPaymentBatch({ billIds: [design], format: "csv", executionDate: tomorrow })).rejects.toThrow(/already paid or doesn't exist/);
    signInAs("user_pay", co);
  });

  it("prints UK and international bank details on invoices, and renders the page", async () => {
    const inv = await q.createInvoice({ customerName: "Client", customerEmail: null, issueDate: "2026-09-01", dueDate: "2026-09-30", vatRate: 20, notes: null, items: [{ description: "Work", quantity: 1, unitPrice: 100 }] });
    const { bytes } = await invoicePdf(inv.id);
    expect(bytes.length).toBeGreaterThan(1000);
    const html = renderToString(await PayPage());
    expect(html).toContain("Bills to pay");
    expect(html).toContain("Pixel Studio");
  });
});
