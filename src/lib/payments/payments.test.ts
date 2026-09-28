import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPain001 } from "./pain001";
import { bicOk, cleanIban, ibanOk, sepaText } from "./validate";

const hasXmllint = (() => {
  try {
    execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("bank details", () => {
  it("checks IBANs by country length and mod-97", () => {
    expect(ibanOk(cleanIban("GB29 NWBK 6016 1331 9268 19"))).toBe(true);
    expect(ibanOk("DE89370400440532013000")).toBe(true);
    expect(ibanOk("FR1420041010050500013M02606")).toBe(true);
    expect(ibanOk("GB29NWBK60161331926818")).toBe(false); // one digit wrong
    expect(ibanOk("DE8937040044053201300")).toBe(false); // too short for Germany
    expect(ibanOk("hello")).toBe(false);
  });

  it("checks BICs and folds text to the SEPA character set", () => {
    expect(bicOk("NWBKGB2L")).toBe(true);
    expect(bicOk("DEUTDEFF500")).toBe(true);
    expect(bicOk("NWBK GB2L")).toBe(false);
    expect(sepaText("Zoë & Co — Invoice #42 <urgent>", 140)).toBe("Zoe + Co Invoice 42 urgent");
    expect(sepaText("x".repeat(200), 35)).toHaveLength(35);
  });
});

describe("pain.001 payment file", () => {
  const xml = buildPain001({
    messageId: "VERITY-20261001-1",
    createdAt: "2026-10-01T09:30:00.000Z",
    executionDate: "2026-10-02",
    debtor: { name: "Studio & Sons Ltd", iban: "GB29NWBK60161331926819", bic: "NWBKGB2L" },
    payments: [
      { endToEndId: "BILL-3001", amountMinor: 50000, currency: "EUR", creditorName: "Berlin GmbH", creditorIban: "DE89370400440532013000", creditorBic: "COBADEFFXXX", remittance: "BILL-3001 Invoice 2026/88" },
      { endToEndId: "BILL-3002", amountMinor: 12345, currency: "EUR", creditorName: "Café Paris SARL", creditorIban: "FR1420041010050500013M02606", creditorBic: null, remittance: "Facture F-77" },
      { endToEndId: "BILL-3003", amountMinor: 99999, currency: "USD", creditorName: "Acme <Inc>", creditorIban: "GB82WEST12345698765432", creditorBic: "WESTGB2L", remittance: "PO 991" },
    ],
  });

  it("groups by currency with control sums", () => {
    expect(xml).toContain("<NbOfTxs>3</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>1623.44</CtrlSum>");
    expect(xml.match(/<PmtInf>/g)).toHaveLength(2);
    expect(xml).toContain('<InstdAmt Ccy="EUR">123.45</InstdAmt>');
    expect(xml).toContain("<ChrgBr>SLEV</ChrgBr>");
    expect(xml).toContain("<ChrgBr>SHAR</ChrgBr>");
    expect(xml).toContain("<Nm>Cafe Paris SARL</Nm>");
    expect(xml).toContain("<Nm>Studio + Sons Ltd</Nm>");
  });

  it.runIf(hasXmllint)("validates against the ISO 20022 pain.001.001.03 schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "pain001-"));
    const file = join(dir, "p.xml");
    writeFileSync(file, xml);
    const out = execFileSync("xmllint", ["--noout", "--schema", join(process.cwd(), "test/fixtures/iso20022/pain.001.001.03.xsd"), file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    expect(out).toBe("");
  });
});
