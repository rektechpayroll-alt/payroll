import { describe, expect, it } from "vitest";
import { mtdReturnBody, vatBoxes, vatFromGross, vatQuarters } from "./calc";

describe("VAT arithmetic", () => {
  it("extracts VAT from gross amounts", () => {
    expect(vatFromGross(12000, 20)).toBe(2000); // £120 incl. 20% → £20 VAT
    expect(vatFromGross(10500, 5)).toBe(500);
    expect(vatFromGross(1000, 20)).toBe(167); // 1000 × 20/120 = 166.67 → 167p
    expect(vatFromGross(5000, 0)).toBe(0);
  });

  it("builds the nine boxes", () => {
    const b = vatBoxes([
      { kind: "sale", net: 100000, vat: 20000 },
      { kind: "sale", net: 50055, vat: 0 },
      { kind: "purchase", net: 30099, vat: 6020 },
    ]);
    expect(b).toEqual({ box1: 20000, box2: 0, box3: 20000, box4: 6020, box5: 13980, box6: 150000, box7: 30000, box8: 0, box9: 0, payable: true });
  });

  it("box 5 is always positive; repayments are flagged", () => {
    const b = vatBoxes([{ kind: "purchase", net: 100000, vat: 20000 }, { kind: "sale", net: 10000, vat: 2000 }]);
    expect(b.box5).toBe(18000);
    expect(b.payable).toBe(false);
  });

  it("works out quarters for each stagger", () => {
    expect(vatQuarters(1, 2026)).toEqual([
      { start: "2026-01-01", end: "2026-03-31" },
      { start: "2026-04-01", end: "2026-06-30" },
      { start: "2026-07-01", end: "2026-09-30" },
      { start: "2026-10-01", end: "2026-12-31" },
    ]);
    expect(vatQuarters(2, 2026)[0]).toEqual({ start: "2026-02-01", end: "2026-04-30" });
    expect(vatQuarters(3, 2026)[3]).toEqual({ start: "2026-12-01", end: "2027-02-28" });
  });

  it("formats the MTD submission (2dp for boxes 1–5, whole pounds for 6–9)", () => {
    const body = mtdReturnBody("26C3", vatBoxes([{ kind: "sale", net: 100099, vat: 20020 }, { kind: "purchase", net: 5050, vat: 1010 }]));
    expect(body).toEqual({
      periodKey: "26C3",
      vatDueSales: 200.2,
      vatDueAcquisitions: 0,
      totalVatDue: 200.2,
      vatReclaimedCurrPeriod: 10.1,
      netVatDue: 190.1,
      totalValueSalesExVAT: 1000,
      totalValuePurchasesExVAT: 50,
      totalValueGoodsSuppliedExVAT: 0,
      totalAcquisitionsExVAT: 0,
      finalised: true,
    });
  });
});
