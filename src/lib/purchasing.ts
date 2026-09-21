import type { Bill } from "./queries";

/** Accounts payable — Pay Bills and Create Purchase Orders. Same split as lib/ledger.ts: derived logic kept separate from the raw fetch. */

export type BillWithStatus = Bill & { isOverdue: boolean; daysOverdue: number };

export function withBillOverdueStatus(bill: Bill, today: Date = new Date()): BillWithStatus {
  const due = new Date(bill.due_date);
  const isOverdue = bill.status === "unpaid" && !Number.isNaN(due.getTime()) && due.getTime() < today.getTime();
  const daysOverdue = isOverdue ? Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  return { ...bill, isOverdue, daysOverdue };
}

export type PayablesSummary = {
  unpaidTotal: number;
  unpaidCount: number;
  overdueTotal: number;
  overdueCount: number;
};

export function summarizePayables(bills: BillWithStatus[]): PayablesSummary {
  const unpaid = bills.filter((b) => b.status === "unpaid");
  const overdue = unpaid.filter((b) => b.isOverdue);
  return {
    unpaidTotal: unpaid.reduce((sum, b) => sum + b.total, 0),
    unpaidCount: unpaid.length,
    overdueTotal: overdue.reduce((sum, b) => sum + b.total, 0),
    overdueCount: overdue.length,
  };
}
