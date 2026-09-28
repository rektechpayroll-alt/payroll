import { describe, expect, it } from "vitest";
import { autoMatch, suggestionsFor, type Candidates } from "./match";

const none: Candidates = { invoices: [], bills: [], payRuns: [], recorded: [], rules: [] };
const line = (description: string, amount: number, date = "2026-09-10") => ({ id: "l1", date, description, amount });

describe("reconciliation suggestions", () => {
  it("matches a receipt to an invoice, confidently when the number is in the reference", () => {
    const c = { ...none, invoices: [{ id: "i1", number: "INV-1042", customer: "Kestrel Holdings", total: 222000 }] };
    expect(suggestionsFor(line("KESTREL HOLDINGS REF 1042", 222000), c)).toEqual([
      { kind: "invoice", id: "i1", label: "Invoice INV-1042 — Kestrel Holdings", confidence: "high" },
    ]);
    expect(suggestionsFor(line("FASTER PAYMENT", 222000), c)[0].confidence).toBe("medium");
    expect(suggestionsFor(line("KESTREL", 222001), c)).toEqual([]); // amounts must match exactly
    expect(suggestionsFor(line("KESTREL", -222000), c)).toEqual([]); // a payment out never pays an invoice
  });

  it("matches payments out to bills and wages", () => {
    const c = {
      ...none,
      bills: [{ id: "b1", reference: "BILL-3003", supplier: "Harrow Print & Signage", total: 21000 }],
      payRuns: [{ id: "r1", label: "September 2026 payroll", netPay: 909513, payDate: "2026-09-30" }],
    };
    expect(suggestionsFor(line("HARROW PRINT", -21000), c)[0]).toMatchObject({ kind: "bill", confidence: "high" });
    expect(suggestionsFor(line("BACS SALARIES SEP", -909513), c)[0]).toMatchObject({ kind: "payroll", confidence: "high" });
  });

  it("prefers a payment already recorded in Verity, within a week", () => {
    const c = { ...none, recorded: [{ id: "t1", date: "2026-09-08", description: "PROPTECH EUROPE — BILL-3004", amount: -99000 }] };
    expect(suggestionsFor(line("PROPTECH EUROPE GMBH", -99000, "2026-09-10"), c)[0]).toMatchObject({ kind: "recorded", confidence: "high" });
    expect(suggestionsFor(line("PROPTECH", -99000, "2026-09-14"), c)[0].confidence).toBe("medium");
    expect(suggestionsFor(line("PROPTECH", -99000, "2026-09-20"), c)).toEqual([]);
  });

  it("applies bank rules by text and direction", () => {
    const c = { ...none, rules: [{ id: "r", contains: "aws", direction: "debit" as const, accountCode: "7500", accountName: "Software and IT" }] };
    expect(suggestionsFor(line("AMAZON WEB SERVICES AWS EMEA", -8420), c)[0]).toMatchObject({ kind: "rule", accountCode: "7500" });
    expect(suggestionsFor(line("AWS REFUND", 8420), c)).toEqual([]);
  });
});

describe("auto-reconcile", () => {
  it("only acts on a single high-confidence suggestion", () => {
    const one = [{ kind: "invoice" as const, id: "a", label: "", confidence: "high" as const }];
    expect(autoMatch(one)).toEqual(one[0]);
    expect(autoMatch([{ ...one[0], confidence: "medium" }])).toBeNull();
    expect(autoMatch([...one, { ...one[0], id: "b" }])).toBeNull();
    // two invoices for the same amount, only one mentioned → still ambiguous
    expect(autoMatch([...one, { ...one[0], id: "b", confidence: "medium" }])).toBeNull();
  });
});
