import type { Contact, Invoice, Bill } from "./queries";

/**
 * Manage Contacts — balances are computed by matching the contact's name against
 * invoices.customer_name / bills.supplier_name rather than a new foreign key, since those
 * columns already carry the name on every invoice/bill shipped so far. A real FK migration
 * across four already-live tables is a bigger, riskier change than this demo scale needs.
 */

export type ContactWithBalance = Contact & { balance: number };

export function withBalances(contacts: Contact[], invoices: Invoice[], bills: Bill[]): ContactWithBalance[] {
  return contacts.map((c) => {
    const balance =
      c.type === "customer"
        ? invoices.filter((i) => i.customer_name === c.name && i.status === "sent").reduce((sum, i) => sum + i.total, 0)
        : bills.filter((b) => b.supplier_name === c.name && b.status === "unpaid").reduce((sum, b) => sum + b.total, 0);
    return { ...c, balance: Math.round(balance * 100) / 100 };
  });
}
