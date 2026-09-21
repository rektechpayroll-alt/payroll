"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";
import type { Contact } from "@/lib/queries";
import type { ContactWithBalance } from "@/lib/contacts";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-3.5 w-3.5"}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function ContactsHub({ initialContacts }: { initialContacts: ContactWithBalance[] }) {
  const router = useRouter();
  const [contacts, setContacts] = useState(initialContacts);
  const [formOpen, setFormOpen] = useState(false);

  const customers = useMemo(() => contacts.filter((c) => c.type === "customer"), [contacts]);
  const suppliers = useMemo(() => contacts.filter((c) => c.type === "supplier"), [contacts]);
  const totalOwed = customers.reduce((sum, c) => sum + c.balance, 0);
  const totalOwing = suppliers.reduce((sum, c) => sum + c.balance, 0);

  return (
    <div>
      <StatRow>
        <StatTile label="Customers" value={String(customers.length)} meta={<span>{gbp(totalOwed)} owed to you</span>} />
        <StatTile label="Suppliers" value={String(suppliers.length)} meta={<span>{gbp(totalOwing)} you owe</span>} />
      </StatRow>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
          <div>
            <h2 className="font-display text-[16.5px] font-semibold">Contacts</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Balances computed live from open invoices and unpaid bills</div>
          </div>
          <button onClick={() => setFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
            <PlusIcon />
            New contact
          </button>
        </div>

        {formOpen && (
          <NewContactForm
            onCreated={(c) => {
              setContacts((prev) => [...prev, { ...c, balance: 0 }]);
              setFormOpen(false);
              router.refresh();
            }}
            onCancel={() => setFormOpen(false)}
          />
        )}

        <ContactGroup title="Customers" contacts={customers} />
        <ContactGroup title="Suppliers" contacts={suppliers} />
      </section>
    </div>
  );
}

function ContactGroup({ title, contacts }: { title: string; contacts: ContactWithBalance[] }) {
  if (!contacts.length) return null;
  return (
    <div>
      <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
        {title}
      </div>
      {contacts.map((c, i) => (
        <div key={c.id} className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[12px] ${i === contacts.length - 1 ? "" : "border-b border-[var(--border)]"}`}>
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold">{c.name}</div>
            {c.email && <div className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{c.email}</div>}
          </div>
          <span className="font-num text-[13.5px] font-semibold">{c.balance > 0 ? gbp(c.balance) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function NewContactForm({ onCreated, onCancel }: { onCreated: (contact: Contact) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<Contact["type"]>("customer");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/contacts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, email: email || null, phone: null }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      onCreated(data.contact as Contact);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[16px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <select value={type} onChange={(e) => setType(e.target.value as Contact["type"])} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]">
          <option value="customer">Customer</option>
          <option value="supplier">Supplier</option>
        </select>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
      </div>
      <div className="mt-3.5 flex items-center justify-end gap-2">
        {error && <span className="mr-auto text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
        <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">Cancel</button>
        <button onClick={submit} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
          {submitting ? "Creating…" : "Create contact"}
        </button>
      </div>
    </div>
  );
}
