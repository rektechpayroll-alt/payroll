import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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
import * as runs from "@/lib/payroll/runs";
import * as records from "@/lib/payroll/records";
import * as rti from "@/lib/rti/submissions";

const FIXTURES = resolve(__dirname, "../../test/fixtures/hmrc-rti-2026-27");
const tools = (() => {
  try {
    execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    execFileSync("xsltproc", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();
const suite = TEST_DB && tools ? describe : describe.skip;

function check(xml: string, xsd: string, xslt: string) {
  const dir = mkdtempSync(join(tmpdir(), "rti-it-"));
  writeFileSync(join(dir, "msg.xml"), xml);
  const body = xml.slice(xml.indexOf("<IRenvelope"), xml.lastIndexOf("</IRenvelope>") + 13);
  writeFileSync(join(dir, "body.xml"), body);
  let schema = "";
  try {
    execFileSync("xmllint", ["--noout", "--schema", join(FIXTURES, xsd), join(dir, "body.xml")], { stdio: "pipe" });
  } catch (e) {
    schema = String((e as { stderr?: Buffer }).stderr);
  }
  const rules = [...execFileSync("xsltproc", [join(FIXTURES, xslt), join(dir, "msg.xml")]).toString().matchAll(/<(?:\w+:)?Text>([^<]*)</g)].map((m) => m[1]);
  return { schema, rules };
}

const details = (over: Partial<q.PayDetailsInput> = {}): q.PayDetailsInput => ({
  payBasis: "salary", annualSalary: 36_000, hourlyRate: null, payFrequency: "monthly", niCategory: "A", studentLoanPlan: "2",
  postgradLoan: false, pensionEnrolled: true, pensionEmployeePct: 5, pensionEmployerPct: 3, dateOfBirth: "1990-01-01",
  isDirector: false, previousPay: 0, previousTax: 0, leavingDate: null, ...over,
});

suite("HMRC RTI from real payroll data", () => {
  let runId: string;
  beforeAll(async () => {
    signInAs("user_rti", null);
    const co = await createBusiness({ name: "RTI Test Ltd", paySchedule: "Monthly", employeeCount: 2, sampleData: false });
    signInAs("user_rti", co);
    await records.updatePayrollSettings({
      payeReference: "123/AB45678", accountsOfficeReference: "123PA00012345", pensionScheme: "relief_at_source",
      claimEmploymentAllowance: true, smallEmployerRelief: false, bankAccountName: null, bankSortCode: null, bankAccountNumber: null, bacsSun: null,
    });
    const people = [
      { name: "Anna Bell", nino: "AB123456C", over: {} },
      { name: "Chris José Dane", nino: "TBC", over: { isDirector: true, annualSalary: 60_000, studentLoanPlan: null } },
    ];
    for (const p of people) {
      const e = await q.createEmployee({
        name: p.name, role: "Staff", email: `${p.name.split(" ")[0].toLowerCase()}@example.test`, employmentType: "Full-time",
        startDate: "1 Sep 2026", taxCode: "1257L", niNumber: p.nino, weeklyHours: 37.5,
      });
      await q.updateEmployeePayDetails(e.id, details(p.over));
      await records.updateEmployeeRecord(e.id, {
        gender: "F", addressLine1: "1 High Street", addressLine2: "London", postcode: "SW1A 1AA", payrollId: null, starterDeclaration: "A",
        workingDays: [1, 2, 3, 4, 5], payrolledBenefitsAnnual: 0, bankAccountName: null, bankSortCode: null, bankAccountNumber: null,
      });
      if (p.name === "Anna Bell") {
        await records.createAbsence({ employeeId: e.id, type: "paternity", startDate: "2026-09-07", endDate: "2026-09-20", averageWeeklyEarnings: 692.31, deductPay: true, notes: null });
      }
    }
    runId = await runs.createPayRun("monthly", "2026-09-30");
    for (const l of (await q.getLinesForRun(runId)).filter((x) => x.severity && x.severity !== "critical")) await q.resolveLine(l.id);
    await q.approveRun(runId);
  });

  it("FPS built from an approved run passes HMRC's schema and business rules", async () => {
    const { doc, problems, employeeCount } = await rti.prepareFps(runId);
    expect(problems).toEqual([]);
    expect(employeeCount).toBe(2);
    const { xml } = rti.envelopeForDownload("FPS", doc, false);
    const result = check(xml, "FullPaymentSubmission-2027-v1-0.xsd", "FullPaymentSubmission-2027-v1-0.xslt");
    expect(result.schema).toBe("");
    expect(result.rules).toEqual([]);
    // Spot-check the figures carried across
    expect(xml).toContain("<StartDec>A</StartDec>");
    expect(xml).toContain("<DirectorsNIC>AN</DirectorsNIC>");
    expect(xml).toContain("<StudentLoanRecovered PlanType=\"02\">");
    expect(xml).toMatch(/<SPPYTD>388\.64<\/SPPYTD>/);
    expect(xml).toContain("<Fore>Chris Jose</Fore><Sur>Dane</Sur>");
  });

  it("EPS for the month passes, claiming EA and recovering 92% of SPP", async () => {
    const { doc } = await rti.prepareEps("2026-27", 6);
    const { xml } = rti.envelopeForDownload("EPS", doc, false);
    const result = check(xml, "EmployerPaymentSummary-2027-v1-0.xsd", "EmployerPaymentSummary-2027-v1-0.xslt");
    expect(result.schema).toBe("");
    expect(result.rules).toEqual([]);
    expect(xml).toContain("<EmpAllceInd>yes</EmpAllceInd>");
    expect(xml).toContain("<SPPRecovered>357.55</SPPRecovered>"); // 388.64 × 92%
  });

  it("an EPS for a month with no payments passes too", async () => {
    await expect(rti.prepareEps("2026-27", 8, { noPayment: true })).rejects.toThrow(/already started/);
    const { doc } = await rti.prepareEps("2026-27", 5, { noPayment: true });
    const { xml } = rti.envelopeForDownload("EPS", doc, false);
    const result = check(xml, "EmployerPaymentSummary-2027-v1-0.xsd", "EmployerPaymentSummary-2027-v1-0.xslt");
    expect(result.schema).toBe("");
    expect(result.rules).toEqual([]);
    expect(xml).toContain("<NoPaymentDates><From>2026-08-06</From><To>2026-09-05</To></NoPaymentDates>");
  });

  describe("submission conversation (HMRC simulated)", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      delete process.env.HMRC_VENDOR_ID;
    });

    it("refuses to submit until Verity has an HMRC vendor ID", async () => {
      const { doc } = await rti.prepareFps(runId);
      await expect(
        rti.submitRti({ kind: "FPS", runId, taxYear: "2026-27", taxMonth: 6, doc, credentials: { senderId: "u", password: "p" }, testInLive: true })
      ).rejects.toThrow(/HMRC_VENDOR_ID/);
    });

    it("submits, polls to acceptance, deletes, and never stores the password", async () => {
      process.env.HMRC_VENDOR_ID = "8888";
      const calls: string[] = [];
      const reply = (qualifier: string, extra = "") =>
        new Response(`<?xml version="1.0"?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>HMRC-PAYE-RTI-FPS-TIL</Class><Qualifier>${qualifier}</Qualifier><Function>submit</Function><CorrelationID>ABC123</CorrelationID>${extra}</MessageDetails></Header><GovTalkDetails/><Body/></GovTalkMessage>`);
      vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
        const body = String(init.body);
        calls.push(`${url} ${body.match(/<Qualifier>(\w+)/)![1]} ${body.match(/<Function>(\w+)/)![1]}`);
        if (body.includes("<Qualifier>request</Qualifier><Function>submit")) {
          return reply("acknowledgement", '<ResponseEndPoint PollInterval="10">https://test-transaction-engine.tax.service.gov.uk/poll</ResponseEndPoint>');
        }
        if (body.includes("<Qualifier>poll</Qualifier>")) return reply("response");
        return reply("response");
      }));

      const { doc } = await rti.prepareFps(runId);
      const submitted = await rti.submitRti({ kind: "FPS", runId, taxYear: "2026-27", taxMonth: 6, doc, credentials: { senderId: "GWUSER", password: "s3cret-pw" }, testInLive: true });
      expect(submitted.status).toBe("submitted");
      expect(submitted.correlation_id).toBe("ABC123");
      const done = await rti.pollRti(submitted.id);
      expect(done.status).toBe("accepted");
      expect(calls).toEqual([
        "https://test-transaction-engine.tax.service.gov.uk/submission request submit",
        "https://test-transaction-engine.tax.service.gov.uk/poll poll submit",
        "https://test-transaction-engine.tax.service.gov.uk/submission request delete",
      ]);
      const { getPool } = await import("@/lib/db");
      const { rows } = await getPool().query("SELECT request_xml FROM rti_submissions WHERE id = $1", [submitted.id]);
      expect(rows[0].request_xml).not.toContain("s3cret-pw");
      expect(rows[0].request_xml).not.toContain("GWUSER");
    });

    it("records HMRC's business errors when a submission is rejected", async () => {
      process.env.HMRC_VENDOR_ID = "8888";
      vi.stubGlobal("fetch", vi.fn(async () =>
        new Response(`<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><Header><MessageDetails><Qualifier>error</Qualifier><CorrelationID>DEF</CorrelationID></MessageDetails></Header><GovTalkDetails><GovTalkErrors><Error><RaisedBy>Department</RaisedBy><Number>1046</Number><Type>fatal</Type><Text>Authentication Failure. The supplied user credentials failed validation for the requested service.</Text></Error></GovTalkErrors></GovTalkDetails></GovTalkMessage>`)
      ));
      const { doc } = await rti.prepareFps(runId);
      const s = await rti.submitRti({ kind: "FPS", runId, taxYear: "2026-27", taxMonth: 6, doc, credentials: { senderId: "bad", password: "bad" }, testInLive: true });
      expect(s.status).toBe("rejected");
      expect(s.errors![0]).toMatchObject({ number: "1046", text: expect.stringContaining("Authentication Failure") });
    });
  });
});
