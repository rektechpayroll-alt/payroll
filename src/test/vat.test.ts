import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = vi.hoisted(() => {
  const url = process.env.TEST_DATABASE_URL;
  if (url) process.env.DATABASE_URL = url;
  return url;
});
vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());

import { signInAs } from "@/test/harness";
import { createBusiness } from "@/lib/companies";
import * as q from "@/lib/queries";
import * as bank from "@/lib/banking/bank";
import * as vat from "@/lib/vat/returns";
import * as mtd from "@/lib/vat/mtd";
import * as L from "@/lib/ledger/reports";

const suite = TEST_DB ? describe : describe.skip;
const bal = async (code: string) => (await L.accountBalances(null, "2026-12-31")).find((a) => a.code === code)!.balance;

suite("VAT", () => {
  let co: string;
  let emp: string;
  beforeAll(async () => {
    signInAs("user_vat", null);
    co = await createBusiness({ name: "VAT Ltd", paySchedule: "Monthly", employeeCount: 1, sampleData: false });
    signInAs("user_vat", co);
    emp = (await q.createEmployee({ name: "Val Vat", role: "Staff", email: "val@example.test", employmentType: "Full-time", startDate: "2026-04-01", taxCode: "1257L", niNumber: "AB123456C", weeklyHours: 37.5 })).id;
  });

  it("validates settings", async () => {
    await expect(vat.updateVatSettings({ registered: true, vatNumber: "123", scheme: "accrual", stagger: 1 })).rejects.toThrow(/9 digits/);
    await vat.updateVatSettings({ registered: true, vatNumber: "GB 123456789", scheme: "accrual", stagger: 1 });
    expect((await vat.getVatSettings()).vat_number).toBe("123456789");
  });

  it("posts VAT from bills, claims and bank lines to the VAT account", async () => {
    const inv = await q.createInvoice({ customerName: "Client Ltd", customerEmail: null, issueDate: "2026-09-01", dueDate: "2026-09-30", vatRate: 20, notes: null, items: [{ description: "Work", quantity: 1, unitPrice: 1000 }] });
    await q.updateInvoiceStatus(inv.id, "sent");
    await q.createBill({ supplierName: "Stationers", category: "Stationery", billDate: "2026-09-05", dueDate: "2026-09-30", total: 120, vatRate: 20 });
    const claim = await q.createExpenseClaim({ employeeId: emp, description: "Client lunch", category: "Travel", amount: 60, expenseDate: "2026-09-10", vatAmount: 10 });
    await q.updateExpenseClaimStatus(claim.id, "approved");
    await bank.importStatement("s.csv", "Date,Description,Amount\n12/09/2026,AWS EMEA,-84.00");
    const line = (await bank.listStatementLines())[0];
    await bank.reconcileLine(line.id, { kind: "account", accountCode: "7500", vatRate: 20 });
    expect(await bal("7800")).toBe(100); // bill net
    expect(await bal("7400")).toBe(50); // claim net
    expect(await bal("7500")).toBe(70); // AWS net
    expect(await bal("2200")).toBe(200 - 20 - 10 - 14); // output − input VAT
    const bs = await L.balanceSheet("2026-12-31");
    expect(bs.balanced).toBe(true);
  });

  it("calculates the nine boxes for the quarter (standard accounting)", async () => {
    const r = await vat.calculateVatReturn("2026-07-01", "2026-09-30");
    expect(r.boxes).toEqual({ box1: 20000, box2: 0, box3: 20000, box4: 4400, box5: 15600, box6: 100000, box7: 22000, box8: 0, box9: 0, payable: true });
    expect(r.sources.map((s) => s.type)).toEqual(["Invoice", "Bill", "Expense claim", "Bank payment"]);
  });

  it("cash accounting only counts what's been paid", async () => {
    await vat.updateVatSettings({ registered: true, vatNumber: "123456789", scheme: "cash", stagger: 1 });
    const r = await vat.calculateVatReturn("2026-07-01", "2026-09-30");
    expect(r.boxes.box1).toBe(0); // invoice unpaid
    expect(r.boxes.box4).toBe(1400); // bill unpaid, claim not reimbursed; only the bank line
    await vat.updateVatSettings({ registered: true, vatNumber: "123456789", scheme: "accrual", stagger: 1 });
  });

  it("finalising a past quarter locks it", async () => {
    await q.createBill({ supplierName: "June Supplier", category: "Software", billDate: "2026-06-15", dueDate: "2026-06-30", total: 240, vatRate: 20 });
    const periods = await vat.vatPeriods("2026-09-28");
    const q2 = periods.find((p) => p.start === "2026-04-01")!;
    expect(q2.status).toBe("due");
    await expect(vat.finaliseVatReturn("2026-07-01", "2026-09-30")).rejects.toThrow(/once it has ended/);
    await vat.finaliseVatReturn("2026-04-01", "2026-06-30");
    await expect(vat.finaliseVatReturn("2026-04-01", "2026-06-30")).rejects.toThrow(/already been finalised/);
    await expect(q.createBill({ supplierName: "Late", category: null, billDate: "2026-06-20", dueDate: "2026-06-30", total: 10 })).rejects.toThrow(/already filed/);
    await q.createBill({ supplierName: "On time", category: null, billDate: "2026-07-02", dueDate: "2026-07-30", total: 10 }); // next quarter is open
    const after = (await vat.vatPeriods("2026-09-28")).find((p) => p.start === "2026-04-01")!;
    expect(after.status).toBe("finalised");
    expect(after.boxes!.box4).toBe(4000);
  });

  describe("filing with HMRC (simulated)", () => {
    const device = { deviceId: "beec798b-b366-47fa-b1f8-92cede14a1ce", userAgent: "Mozilla/5.0", timezone: "UTC+01:00", screens: [{ width: 1920, height: 1080, scalingFactor: 1, colourDepth: 24 }], windowSize: { width: 1256, height: 803 } };
    const meta = { clientIp: "198.51.100.7", clientPort: "51234", vendorIp: null, forwarded: [{ by: "verity.example", for: "198.51.100.7" }] };
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    });

    it("connects, submits the finalised return with fraud headers, and records the receipt", async () => {
      vi.stubEnv("HMRC_MTD_CLIENT_ID", "cid");
      vi.stubEnv("HMRC_MTD_CLIENT_SECRET", "secret");
      vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
      const calls: Array<{ url: string; init: RequestInit }> = [];
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith("/oauth/token")) return new Response(JSON.stringify({ access_token: "AT", refresh_token: "RT", expires_in: 14400 }));
        return new Response(JSON.stringify({ processingDate: "2026-09-28T10:00:00Z", formBundleNumber: "123" }), { status: 201, headers: { "Receipt-ID": "rcpt-1", "X-CorrelationId": "corr-1" } });
      }));
      expect(mtd.mtdConfigProblem()).toBeNull();
      await mtd.completeMtdConnection("auth-code", "https://verity.example");
      expect(await mtd.mtdConnected()).toBe(true);
      const ret = (await vat.vatPeriods("2026-09-28")).find((p) => p.start === "2026-04-01")!;
      const res = await mtd.fileVatReturn(ret.returnId!, "26B2", device, meta);
      expect(res.receiptId).toBe("rcpt-1");
      const submit = calls.find((c) => c.url.includes("/returns"))!;
      expect(submit.url).toBe("https://test-api.service.hmrc.gov.uk/organisations/vat/123456789/returns");
      const h = submit.init.headers as Record<string, string>;
      expect(h.Authorization).toBe("Bearer AT");
      expect(h.Accept).toBe("application/vnd.hmrc.1.0+json");
      expect(h["Gov-Client-Connection-Method"]).toBe("WEB_APP_VIA_SERVER");
      expect(h["Gov-Client-Screens"]).toBe("width=1920&height=1080&scaling-factor=1&colour-depth=24");
      expect(h["Gov-Client-Public-IP"]).toBe("198.51.100.7");
      expect(JSON.parse(String(submit.init.body))).toMatchObject({ periodKey: "26B2", vatReclaimedCurrPeriod: 40, netVatDue: 40, totalValuePurchasesExVAT: 200, finalised: true });
      await expect(mtd.fileVatReturn(ret.returnId!, "26B2", device, meta)).rejects.toThrow(/already been filed/);
      expect((await vat.vatPeriods("2026-09-28")).find((p) => p.start === "2026-04-01")!.status).toBe("submitted");
    });
  });
});
