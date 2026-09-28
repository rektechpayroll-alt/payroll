import { describe, expect, it } from "vitest";
import { amountFits } from "@/lib/banking/match";
import { parseEcbXml } from "./rates";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <gesmes:subject>Reference rates</gesmes:subject>
  <Cube>
    <Cube time='2026-09-25'>
      <Cube currency='USD' rate='1.1712'/>
      <Cube currency='JPY' rate='173.21'/>
      <Cube currency='GBP' rate='0.87215'/>
    </Cube>
    <Cube time="2026-09-24">
      <Cube currency="USD" rate="1.1745"/>
      <Cube currency="GBP" rate="0.8733"/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("ECB rates", () => {
  it("parses the daily and history feeds", () => {
    expect(parseEcbXml(XML)).toEqual([
      { date: "2026-09-25", perEur: { USD: 1.1712, JPY: 173.21, GBP: 0.87215 } },
      { date: "2026-09-24", perEur: { USD: 1.1745, GBP: 0.8733 } },
    ]);
    expect(parseEcbXml("<html>maintenance</html>")).toEqual([]);
  });
});

describe("matching foreign payments", () => {
  it("needs sterling to the penny but allows foreign conversions within 10%", () => {
    expect(amountFits(10000, 10000, false)).toBe(true);
    expect(amountFits(10001, 10000, false)).toBe(false);
    expect(amountFits(10950, 10000, true)).toBe(true);
    expect(amountFits(9000, 10000, true)).toBe(true);
    expect(amountFits(8999, 10000, true)).toBe(false);
  });
});
