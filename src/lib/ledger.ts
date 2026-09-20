import type { BankTransaction, Invoice } from "./queries";

/**
 * Verity Ledger — invoicing and bank reconciliation. Pure derived logic kept separate
 * from lib/queries.ts's raw fetches, same split as lib/rundiff.ts for the payroll diff.
 */

export type InvoiceWithStatus = Invoice & { isOverdue: boolean; daysOverdue: number };

/**
 * Overdue is computed on the fly from today's date rather than stored as its own status —
 * an invoice is "sent" or "paid" in the database; whether a sent invoice happens to be
 * overdue today is a fact about the calendar, not a state someone has to remember to flip.
 */
export function withOverdueStatus(invoice: Invoice, today: Date = new Date()): InvoiceWithStatus {
  const due = new Date(invoice.due_date);
  const isOverdue = invoice.status === "sent" && !Number.isNaN(due.getTime()) && due.getTime() < today.getTime();
  const daysOverdue = isOverdue ? Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  return { ...invoice, isOverdue, daysOverdue };
}

export type LedgerSummary = {
  outstandingTotal: number;
  outstandingCount: number;
  overdueTotal: number;
  overdueCount: number;
  paidTotal: number;
  draftCount: number;
  unmatchedCredits: number;
};

export function summarizeLedger(invoices: InvoiceWithStatus[], transactions: BankTransaction[]): LedgerSummary {
  const sent = invoices.filter((i) => i.status === "sent");
  const overdue = sent.filter((i) => i.isOverdue);
  return {
    outstandingTotal: sent.reduce((sum, i) => sum + i.total, 0),
    outstandingCount: sent.length,
    overdueTotal: overdue.reduce((sum, i) => sum + i.total, 0),
    overdueCount: overdue.length,
    paidTotal: invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.total, 0),
    draftCount: invoices.filter((i) => i.status === "draft").length,
    unmatchedCredits: transactions.filter((t) => t.direction === "credit" && t.status === "unmatched").length,
  };
}

/**
 * The simplest real reconciliation heuristic: for each unmatched bank credit, suggest the
 * one open (sent) invoice with the same total to the penny. A reviewer still has to confirm
 * the match — this only removes the "scan two lists by eye" step, not the human sign-off.
 */
export function suggestMatches(invoices: Invoice[], transactions: BankTransaction[]): Map<string, string> {
  const suggestions = new Map<string, string>(); // transactionId -> invoiceId
  const claimed = new Set<string>();
  const openInvoices = invoices.filter((i) => i.status === "sent");

  for (const txn of transactions) {
    if (txn.direction !== "credit" || txn.status !== "unmatched") continue;
    const match = openInvoices.find((inv) => !claimed.has(inv.id) && Math.abs(inv.total - txn.amount) < 0.005);
    if (match) {
      suggestions.set(txn.id, match.id);
      claimed.add(match.id);
    }
  }
  return suggestions;
}
