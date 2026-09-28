import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEps } from "./eps";
import { buildFps, hmrcName, type FpsEmployee } from "./fps";
import { buildGovTalkMessage } from "./govtalk";

const FIXTURES = resolve(__dirname, "../../../test/fixtures/hmrc-rti-2026-27");
const tools = (() => {
  try {
    execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    execFileSync("xsltproc", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const employer = { officeNo: "123", payeRef: "AB45678", aoRef: "123PA00012345" };
const opts = { testInLive: false, gatewayTest: true, senderId: "TESTUSER", password: "testing1", vendorId: "8888", product: "Verity", version: "1.0" };

const alice: FpsEmployee = {
  nino: "AB123456C",
  forename: "Álice",
  surname: "O'Neil-Smith",
  address: { lines: ["1 High Street", "London"], postcode: "SW1A 1AA" },
  birthDate: "1990-01-01",
  gender: "F",
  director: false,
  starter: null,
  payId: "EMP001",
  leavingDate: null,
  ytd: { taxablePay: 18000, tax: 2342, studentLoan: 294, postgradLoan: null, benefits: 0, pensionNetPay: 0, pensionNotNetPay: 595.2, smp: 0, spp: 0, sap: 0, shpp: 0, spbp: 0, sncp: 0 },
  payment: {
    payFreq: "M1", pmtDate: "2026-09-30", weekNo: null, monthNo: 6, hoursBand: "D", taxCode: "1257L", nonCumulative: false, regime: null,
    taxablePay: 3000, dednsFromNetPay: 99.2, payAfterStatDedns: 2404.64, benefits: 0, pensionNetPay: 0, pensionNotNetPay: 99.2,
    studentLoan: { plan: "02", amount: 49 }, postgradLoan: null, tax: 391, unpaidAbsence: false,
  },
  ni: { letter: "A", grossPd: 3000, grossYtd: 18000, atLelYtd: 3354, lelToPtYtd: 2934, ptToUelYtd: 11712, employerPd: 387.45, employerYtd: 2324.7, employeePd: 156.16, employeeYtd: 936.96 },
};

const starterDirector: FpsEmployee = {
  ...alice,
  nino: null,
  forename: "Dee",
  surname: "Director",
  gender: "M",
  director: true,
  starter: { startDate: "2026-09-01", declaration: "A", studentLoan: false, postgradLoan: false },
  payId: "EMP002",
  ytd: { ...alice.ytd, studentLoan: null, pensionNotNetPay: 0, smp: 1992.86 },
  payment: { ...alice.payment, studentLoan: null, taxCode: "1257L", nonCumulative: true, regime: "S", pensionNotNetPay: 0, dednsFromNetPay: 0 },
};

function write(xml: string) {
  const dir = mkdtempSync(join(tmpdir(), "rti-"));
  const file = join(dir, "msg.xml");
  writeFileSync(file, xml);
  return { dir, file };
}

/** Runs xmllint schema validation on one extracted element; returns "" on success, else the errors. */
function validate(xml: string, xsd: string) {
  const { file } = write(xml);
  try {
    execFileSync("xmllint", ["--noout", "--schema", join(FIXTURES, xsd), file], { stdio: "pipe" });
    return "";
  } catch (e) {
    return String((e as { stderr?: Buffer }).stderr);
  }
}

/** HMRC's business rules (schematron → XSLT). Returns the failed assertions' messages. */
function businessRules(xml: string, xslt: string): string[] {
  const { file } = write(xml);
  const out = execFileSync("xsltproc", [join(FIXTURES, xslt), file]).toString();
  return [...out.matchAll(/<(?:\w+:)?Text>([^<]*)<\/(?:\w+:)?Text>/g)].map((m) => m[1]);
}

const extract = (xml: string, tag: string) => xml.slice(xml.indexOf(`<${tag}`), xml.lastIndexOf(`</${tag}>`) + tag.length + 3);

describe("FPS / EPS generation", () => {
  const fps = buildGovTalkMessage(buildFps({ relatedTaxYear: "26-27", employer, employees: [alice, starterDirector] }), { ...opts, kind: "FPS" });
  const eps = buildGovTalkMessage(
    buildEps({ relatedTaxYear: "26-27", employer, employmentAllowance: true, recoverable: { taxMonth: 6, smp: 1833.43, spp: 0, sap: 0, shpp: 0, spbp: 0, sncp: 0 } }),
    { ...opts, kind: "EPS" }
  );

  it("cleans names to HMRC's character set", () => {
    expect(hmrcName("Álice")).toBe("Alice");
    expect(hmrcName("  O'Neil-Smith ")).toBe("O'Neil-Smith");
    expect(hmrcName("Zoë (Jo)")).toBe("Zoe Jo");
  });

  it.skipIf(!tools)("FPS body is valid against HMRC's 2026-27 schema", () => {
    expect(validate(extract(fps.xml, "IRenvelope"), "FullPaymentSubmission-2027-v1-0.xsd")).toBe("");
  });

  it.skipIf(!tools)("EPS body is valid against HMRC's 2026-27 schema", () => {
    expect(validate(extract(eps.xml, "IRenvelope"), "EmployerPaymentSummary-2027-v1-0.xsd")).toBe("");
  });

  it.skipIf(!tools)("GovTalk envelopes are valid", () => {
    expect(validate(fps.xml, "envelope-v2-0-HMRC.xsd")).toBe("");
    expect(validate(eps.xml, "envelope-v2-0-HMRC.xsd")).toBe("");
  });

  it.skipIf(!tools)("passes HMRC's FPS and EPS business rules", () => {
    expect(businessRules(fps.xml, "FullPaymentSubmission-2027-v1-0.xslt")).toEqual([]);
    expect(businessRules(eps.xml, "EmployerPaymentSummary-2027-v1-0.xslt")).toEqual([]);
  });

  it.skipIf(!tools)("the IRmark matches one computed independently with xmllint's C14N", () => {
    for (const msg of [fps, eps]) {
      const body = extract(msg.xml, "Body")
        .replace("<Body>", '<Body xmlns="http://www.govtalk.gov.uk/CM/envelope">')
        .replace(/<IRmark Type="generic">[^<]*<\/IRmark>/, "");
      const { file } = write(body);
      const canonical = execFileSync("xmllint", ["--c14n", file]);
      const expected = createHash("sha1").update(canonical).digest("base64");
      expect(msg.irmark.base64).toBe(expected);
      expect(msg.xml).toContain(`<IRmark Type="generic">${expected}</IRmark>`);
    }
  });

  it("uses Test-in-Live classes when asked", () => {
    const til = buildGovTalkMessage(buildFps({ relatedTaxYear: "26-27", employer, employees: [alice] }), { ...opts, kind: "FPS", testInLive: true });
    expect(til.xml).toContain("<Class>HMRC-PAYE-RTI-FPS-TIL</Class>");
  });
});
