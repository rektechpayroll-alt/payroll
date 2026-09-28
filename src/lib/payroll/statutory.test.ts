import { describe, expect, it } from "vitest";
import { TAX_YEAR_2026_27 as Y } from "./rates";
import { recoverableAmount, statutoryPayForPeriod, workingDaysBetween, type Absence } from "./statutory";

const monFri = [1, 2, 3, 4, 5];
const sick = (start: string, end: string, awe: number): Absence => ({ type: "sickness", startDate: start, endDate: end, averageWeeklyEarnings: awe, qualifyingDays: monFri });

describe("Statutory Sick Pay (2026/27)", () => {
  it("pays from the first qualifying day at £123.25/week", () => {
    // Mon 5 – Fri 9 Oct 2026: 5 qualifying days = one full week
    expect(statutoryPayForPeriod(Y, sick("2026-10-05", "2026-10-09", 600), "2026-10-01", "2026-10-31")).toMatchObject({ amount: 12325, days: 5 });
  });
  it("part weeks: 3 days → £73.95", () => {
    expect(statutoryPayForPeriod(Y, sick("2026-10-05", "2026-10-07", 600), "2026-10-01", "2026-10-31").amount).toBe(7395);
  });
  it("low earners get 80% of AWE, with no earnings threshold", () => {
    // AWE £100 → £80/week; 2 days → £32.00
    expect(statutoryPayForPeriod(Y, sick("2026-10-05", "2026-10-06", 100), "2026-10-01", "2026-10-31").amount).toBe(3200);
  });
  it("only counts the part of the spell inside the pay period, and skips weekends", () => {
    // Thu 29 Oct – Tue 3 Nov: October period gets Thu+Fri
    expect(statutoryPayForPeriod(Y, sick("2026-10-29", "2026-11-03", 600), "2026-10-01", "2026-10-31")).toMatchObject({ days: 2, amount: 4930 });
  });
  it("stops after 28 weeks", () => {
    const r = statutoryPayForPeriod(Y, sick("2026-04-06", "2027-03-31", 600), "2026-10-01", "2026-10-31");
    // Spell starts Mon 6 Apr: 28 weeks × 5 = 140 qualifying days, the last on Fri 16 Oct.
    // October's qualifying days up to then: 1–2, 5–9, 12–16 → 12
    expect(r.days).toBe(12);
    expect(r.note).toMatch(/28 weeks/);
  });
});

describe("family statutory pay", () => {
  it("SMP: 6 weeks at 90% of AWE, then the lower of £194.32", () => {
    const smp: Absence = { type: "maternity", startDate: "2026-10-01", endDate: "2027-06-29", averageWeeklyEarnings: 500, qualifyingDays: monFri };
    // 30 days from the start: 4 weeks + 2 days at £450/week = 1,800 + 128.5714 → £1,928.58
    expect(statutoryPayForPeriod(Y, smp, "2026-10-01", "2026-10-30").amount).toBe(192858);
    // Week 7 onwards: £194.32/week — a full 7-day week from day 42
    expect(statutoryPayForPeriod(Y, smp, "2026-11-12", "2026-11-18").amount).toBe(19432);
  });
  it("rounds a 90% weekly rate up to the penny", () => {
    const smp: Absence = { type: "maternity", startDate: "2026-10-01", endDate: "2027-06-29", averageWeeklyEarnings: 333.33, qualifyingDays: monFri };
    // 90% = 299.997 → £300.00/week
    expect(statutoryPayForPeriod(Y, smp, "2026-10-01", "2026-10-07").amount).toBe(30000);
  });
  it("SPP: two weeks at the lower rate, nothing after", () => {
    const spp: Absence = { type: "paternity", startDate: "2026-10-05", endDate: "2026-10-25", averageWeeklyEarnings: 300, qualifyingDays: monFri };
    expect(statutoryPayForPeriod(Y, spp, "2026-10-01", "2026-10-31")).toMatchObject({ amount: 38864, days: 14 });
  });
  it("isn't payable below the lower earnings limit", () => {
    const smp: Absence = { type: "maternity", startDate: "2026-10-01", endDate: "2027-06-29", averageWeeklyEarnings: 100, qualifyingDays: monFri };
    expect(statutoryPayForPeriod(Y, smp, "2026-10-01", "2026-10-31")).toMatchObject({ amount: 0, eligible: false });
  });
  it("recovery: 92%, or 109% with Small Employers' Relief", () => {
    expect(recoverableAmount(Y, 100000, false)).toBe(92000);
    expect(recoverableAmount(Y, 100000, true)).toBe(109000);
  });
  it("counts working days", () => {
    expect(workingDaysBetween("2026-10-01", "2026-10-31", monFri)).toBe(22);
  });
});

import { paymentsCsv, standard18 } from "./payments";

describe("payment files", () => {
  const payees = [{ name: "Alice O'Neil, Jr", sortCode: "123456", accountNumber: "00123456", amountPence: 235444, reference: "SALARY 2026-10-30" }];
  it("CSV escapes and formats sort codes", () => {
    expect(paymentsCsv(payees)).toBe('Name,Sort code,Account number,Amount,Reference\r\n"Alice O\'Neil, Jr",12-34-56,00123456,2354.44,SALARY 2026-10-30\r\n');
  });
  it("Standard 18 credit records are exactly 100 characters", () => {
    const rec = standard18(payees, { sortCode: "654321", accountNumber: "87654321", name: "Northgate Dental" }).split("\r\n")[0];
    expect(rec).toHaveLength(100);
    expect(rec.slice(0, 17)).toBe("12345600123456099");
    expect(rec.slice(35, 46)).toBe("00000235444");
    expect(rec.slice(82)).toBe("ALICE O NEIL  JR  ");
  });
});
