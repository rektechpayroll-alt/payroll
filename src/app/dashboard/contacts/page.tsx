import { getCompany, getContacts, getInvoices, getBills } from "@/lib/queries";
import { withBalances } from "@/lib/contacts";
import { ContactsHub } from "@/components/ContactsHub";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const company = await getCompany();
  const [contacts, invoices, bills] = await Promise.all([getContacts(), getInvoices(), getBills()]);
  const withBalance = withBalances(contacts, invoices, bills);

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Contacts</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} &middot; a single directory of every customer and supplier across Verity Ledger and Purchasing,
          each with a live balance.
        </div>
      </div>

      <ContactsHub initialContacts={withBalance} />
    </div>
  );
}
