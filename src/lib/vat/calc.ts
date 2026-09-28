/**
 * VAT arithmetic — pure. Money in pence.
 *
 * The VAT return's nine boxes (HMRC VAT Notice 700/12):
 *   1 VAT due on sales · 2 VAT due on acquisitions from the EU (NI goods only; 0 for GB)
 *   3 total VAT due (1 + 2) · 4 VAT reclaimed on purchases · 5 net VAT (|3 − 4|)
 *   6 sales ex VAT · 7 purchases ex VAT · 8 supplies of goods to the EU · 9 acquisitions from the EU
 * Boxes 1–5 are pounds and pence; boxes 6–9 are whole pounds (pence dropped).
 */

export const VAT_RATES = [
  { rate: 20, label: "Standard 20%" },
  { rate: 5, label: "Reduced 5%" },
  { rate: 0, label: "Zero-rated / exempt / no VAT" },
] as const;

/** The VAT inside a VAT-inclusive amount, rounded to the penny: gross × rate ÷ (100 + rate). */
export function vatFromGross(grossPence: number, ratePercent: number): number {
  if (!ratePercent) return 0;
  return Math.round((grossPence * ratePercent) / (100 + ratePercent));
}

export type VatItem = { kind: "sale" | "purchase"; net: number; vat: number };

export type VatBoxes = {
  box1: number;
  box2: number;
  box3: number;
  box4: number;
  box5: number;
  box6: number;
  box7: number;
  box8: number;
  box9: number;
  /** True when the business owes HMRC (box 3 > box 4); false for a repayment. */
  payable: boolean;
};

export function vatBoxes(items: VatItem[]): VatBoxes {
  const sum = (kind: VatItem["kind"], key: "net" | "vat") => items.filter((i) => i.kind === kind).reduce((s, i) => s + i[key], 0);
  const box1 = sum("sale", "vat");
  const box4 = sum("purchase", "vat");
  const box3 = box1; // + box 2, which is nil outside Northern Ireland goods trade
  const wholePounds = (pence: number) => Math.trunc(pence / 100) * 100;
  return {
    box1,
    box2: 0,
    box3,
    box4,
    box5: Math.abs(box3 - box4),
    box6: wholePounds(sum("sale", "net")),
    box7: wholePounds(sum("purchase", "net")),
    box8: 0,
    box9: 0,
    payable: box3 >= box4,
  };
}

/**
 * VAT quarters for a stagger. Stagger 1 ends Mar/Jun/Sep/Dec, 2 ends Apr/Jul/Oct/Jan,
 * 3 ends May/Aug/Nov/Feb. Returns the quarters ending in the given calendar year.
 */
export function vatQuarters(stagger: 1 | 2 | 3, year: number): Array<{ start: string; end: string }> {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const firstEndMonth = stagger + 1; // 0-based month index: 2 = March, 3 = April, 4 = May
  return [0, 3, 6, 9].map((offset) => {
    const endMonth = firstEndMonth + offset;
    const end = new Date(Date.UTC(year, endMonth + 1, 0));
    const start = new Date(Date.UTC(year, endMonth - 2, 1));
    return { start: iso(start), end: iso(end) };
  });
}

/** MTD VAT API body for a set of boxes (pounds). HMRC wants 2dp for boxes 1–5 and whole pounds for 6–9. */
export function mtdReturnBody(periodKey: string, b: VatBoxes) {
  const pounds = (p: number) => Math.round(p) / 100;
  return {
    periodKey,
    vatDueSales: pounds(b.box1),
    vatDueAcquisitions: pounds(b.box2),
    totalVatDue: pounds(b.box3),
    vatReclaimedCurrPeriod: pounds(b.box4),
    netVatDue: pounds(b.box5),
    totalValueSalesExVAT: b.box6 / 100,
    totalValuePurchasesExVAT: b.box7 / 100,
    totalValueGoodsSuppliedExVAT: b.box8 / 100,
    totalAcquisitionsExVAT: b.box9 / 100,
    finalised: true,
  };
}
