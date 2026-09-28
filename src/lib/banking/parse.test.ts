import { describe, expect, it } from "vitest";
import { parseAmount, parseDate, parseStatement } from "./parse";

// Layouts modelled on common UK bank exports. Figures are made up.

describe("values", () => {
  it("reads UK dates day-first", () => {
    expect(parseDate("05/09/2026")).toBe("2026-09-05");
    expect(parseDate("5/9/26")).toBe("2026-09-05");
    expect(parseDate("2026-09-05")).toBe("2026-09-05");
    expect(parseDate("05 Sep 2026")).toBe("2026-09-05");
    expect(parseDate("05-Sept-2026")).toBe("2026-09-05");
    expect(parseDate("20260905120000")).toBe("2026-09-05");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("Closing balance")).toBeNull();
  });
  it("reads UK amounts", () => {
    expect(parseAmount("£1,234.56")).toBe(123456);
    expect(parseAmount("-12.5")).toBe(-1250);
    expect(parseAmount("(12.00)")).toBe(-1200);
    expect(parseAmount("12.00 DR")).toBe(-1200);
    expect(parseAmount("12.00CR")).toBe(1200);
    expect(parseAmount("+3")).toBe(300);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("CSV layouts", () => {
  it("separate debit / credit columns with a balance (Lloyds-style)", () => {
    const csv = `Transaction Date,Transaction Type,Sort Code,Account Number,Transaction Description,Debit Amount,Credit Amount,Balance
05/09/2026,BGC,'30-00-00,12345678,ACME LTD INV-1041,,3840.00,78840.00
06/09/2026,DEB,'30-00-00,12345678,AMAZON WEB SERVICES,84.20,,78755.80`;
    const r = parseStatement("statement.csv", csv);
    expect(r.errors).toEqual([]);
    expect(r.lines).toEqual([
      { date: "2026-09-05", description: "ACME LTD INV-1041", amount: 384000, balance: 7884000, fitId: null },
      { date: "2026-09-06", description: "AMAZON WEB SERVICES", amount: -8420, balance: 7875580, fitId: null },
    ]);
  });

  it("a signed Value column with type codes that aren't directions (NatWest-style)", () => {
    const csv = `Date, Type, Description, Value, Balance, Account Name, Account Number
05 Sep 2026,DPC,"KESTREL HOLDINGS, REF INV-1042",2220.00,5000.00,'BUSINESS,'600000-12345678
07 Sep 2026,POS,"4412 06SEP26 , PRET A MANGER",-8.10,4991.90,'BUSINESS,'600000-12345678`;
    const r = parseStatement("x.csv", csv);
    expect(r.lines.map((l) => [l.amount, l.description])).toEqual([
      [222000, "KESTREL HOLDINGS, REF INV-1042"],
      [-810, "4412 06SEP26 , PRET A MANGER"],
    ]);
  });

  it("account details above the header and £ symbols (Nationwide-style)", () => {
    const csv = `"Account Name:","FlexDirect ****12345"
"Account Balance:","£4,991.90"
"Available Balance: ","£4,991.90"

"Date","Transaction type","Description","Paid out","Paid in","Balance"
"05 Sep 2026","Transfer from","INVOICE 1043","","£540.00","£5,531.90"
"08 Sep 2026","Direct debit","BRITISH GAS","£112.40","","£5,419.50"`;
    const r = parseStatement("x.csv", csv);
    expect(r.lines.map((l) => [l.date, l.amount, l.balance])).toEqual([
      ["2026-09-05", 54000, 553190],
      ["2026-09-08", -11240, 541950],
    ]);
  });

  it("counterparty + reference and an Amount (GBP) column (Starling-style)", () => {
    const csv = `Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category
05/09/2026,Bellcourt Estates,INV-1045,FASTER PAYMENT,360.00,1360.00,INCOME
06/09/2026,Figma,Subscription,CARD,-12.00,1348.00,SOFTWARE`;
    const r = parseStatement("x.csv", csv);
    expect(r.lines[0]).toMatchObject({ description: "Bellcourt Estates · INV-1045", amount: 36000, balance: 136000 });
    expect(r.lines[1].amount).toBe(-1200);
  });

  it("no header row at all (HSBC-style)", () => {
    const csv = `05/09/2026,ACME LTD,3840.00
06/09/2026,HMRC PAYE,-22014.20`;
    const r = parseStatement("x.csv", csv);
    expect(r.lines.map((l) => l.amount)).toEqual([384000, -2201420]);
  });

  it("reports rows it can't read instead of guessing", () => {
    const csv = `Date,Description,Amount
05/09/2026,OK,10.00
32/09/2026,Bad date,5.00
06/09/2026,Bad amount,ten`;
    const r = parseStatement("x.csv", csv);
    expect(r.lines).toHaveLength(1);
    expect(r.errors).toHaveLength(2);
  });

  it("says so when it can't find the columns", () => {
    const r = parseStatement("x.csv", "foo,bar\n1,2");
    expect(r.lines).toEqual([]);
    expect(r.errors[0]).toMatch(/choose them/);
  });
});

describe("OFX", () => {
  it("reads SGML OFX with FITIDs and the closing balance", () => {
    const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260905120000<TRNAMT>3840.00<FITID>202609050001<NAME>ACME LTD<MEMO>INV-1041</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260906<TRNAMT>-84.20<FITID>202609060001<NAME>AMAZON WEB SERVICES</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>78755.80<DTASOF>20260906</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const r = parseStatement("statement.ofx", ofx);
    expect(r.format).toBe("ofx");
    expect(r.lines).toEqual([
      { date: "2026-09-05", description: "ACME LTD · INV-1041", amount: 384000, balance: null, fitId: "202609050001" },
      { date: "2026-09-06", description: "AMAZON WEB SERVICES", amount: -8420, balance: 7875580, fitId: "202609060001" },
    ]);
  });
});
