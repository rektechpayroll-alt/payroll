"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";
import type { Invoice, BankTransaction, Quote } from "@/lib/queries";
import type { InvoiceWithStatus, LedgerSummary } from "@/lib/ledger";

const STATUS_STYLES: Record<string, { bg: string; ink: string; label: string }> = {
  draft: { bg: "var(--surface-2)", ink: "var(--ink-muted)", label: "Draft" },
  sent: { bg: "var(--warning-soft)", ink: "var(--warning-ink)", label: "Awaiting payment" },
  overdue: { bg: "var(--critical-soft)", ink: "var(--critical-ink)", label: "Overdue" },
  paid: { bg: "var(--good-soft)", ink: "var(--good-ink)", label: "Paid" },
  void: { bg: "var(--surface-2)", ink: "var(--ink-muted)", label: "Void" },
};

const QUOTE_STATUS_STYLES: Record<string, { bg: string; ink: string; label: string }> = {
  draft: { bg: "var(--surface-2)", ink: "var(--ink-muted)", label: "Draft" },
  sent: { bg: "var(--warning-soft)", ink: "var(--warning-ink)", label: "Awaiting response" },
  accepted: { bg: "var(--good-soft)", ink: "var(--good-ink)", label: "Accepted" },
  declined: { bg: "var(--critical-soft)", ink: "var(--critical-ink)", label: "Declined" },
  converted: { bg: "var(--surface-2)", ink: "var(--ink-muted)", label: "Converted to invoice" },
};

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-3.5 w-3.5"}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function CardIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-3.5 w-3.5"}>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9.5h18" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

type NewItem = { description: string; quantity: string; unitPrice: string };

function emptyItem(): NewItem {
  return { description: "", quantity: "1", unitPrice: "" };
}

export function LedgerHub({
  initialInvoices,
  initialQuotes,
  transactions,
  summary,
  suggestions,
}: {
  initialInvoices: InvoiceWithStatus[];
  initialQuotes: Quote[];
  transactions: BankTransaction[];
  summary: LedgerSummary;
  suggestions: Record<string, string>; // transactionId -> invoiceId
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"invoices" | "quotes" | "bank">("invoices");
  const [invoices, setInvoices] = useState(initialInvoices);
  const [quotes, setQuotes] = useState(initialQuotes);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false);
  const [quoteFormOpen, setQuoteFormOpen] = useState(false);

  const invoiceById = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  async function setInvoiceStatus(id: string, status: Invoice["status"]) {
    setBusyId(id);
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      await fetch("/api/ledger/invoices/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function payByCard(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/ledger/invoices/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (res.ok) setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status: "paid" } : i)));
      router.refresh();
      return data;
    } finally {
      setBusyId(null);
    }
  }

  async function setQuoteStatus(id: string, status: Quote["status"]) {
    setBusyId(id);
    setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
    try {
      await fetch("/api/ledger/quotes/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function convertQuote(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/ledger/quotes/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (res.ok) {
        setQuotes((prev) => prev.map((q) => (q.id === id ? data.quote : q)));
        setInvoices((prev) => [...prev, { ...data.invoice, isOverdue: false, daysOverdue: 0 }]);
        setTab("invoices");
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function confirmMatch(transactionId: string, invoiceId: string) {
    setBusyId(transactionId);
    try {
      await fetch("/api/ledger/transactions/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId, invoiceId }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function undoMatch(transactionId: string) {
    setBusyId(transactionId);
    try {
      await fetch("/api/ledger/transactions/unmatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <StatRow>
        <StatTile
          label="Outstanding"
          value={gbp(summary.outstandingTotal)}
          meta={<span>{summary.outstandingCount} invoice{summary.outstandingCount === 1 ? "" : "s"} awaiting payment</span>}
        />
        <StatTile
          label="Overdue"
          value={gbp(summary.overdueTotal)}
          meta={<span>{summary.overdueCount} invoice{summary.overdueCount === 1 ? "" : "s"} past due date</span>}
          pill={
            summary.overdueCount > 0
              ? { tone: "warn", icon: <PlusIcon className="h-2.5 w-2.5" />, text: "Needs chasing" }
              : { tone: "good", icon: <CheckIcon className="h-2.5 w-2.5" />, text: "Nothing overdue" }
          }
        />
        <StatTile
          label="Bank feed"
          value={`${summary.unmatchedCredits} unmatched`}
          meta={<span>{gbp(summary.paidTotal)} reconciled this period</span>}
        />
      </StatRow>

      <div className="mb-4 flex flex-wrap gap-[7px]">
        <button
          onClick={() => setTab("invoices")}
          className={`rounded-full border px-[13px] py-[7px] text-[12.8px] font-semibold ${
            tab === "invoices"
              ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"
          }`}
        >
          Invoices <span className="font-num text-[var(--ink-muted)]">{invoices.length}</span>
        </button>
        <button
          onClick={() => setTab("quotes")}
          className={`rounded-full border px-[13px] py-[7px] text-[12.8px] font-semibold ${
            tab === "quotes"
              ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"
          }`}
        >
          Quotes <span className="font-num text-[var(--ink-muted)]">{quotes.length}</span>
        </button>
        <button
          onClick={() => setTab("bank")}
          className={`rounded-full border px-[13px] py-[7px] text-[12.8px] font-semibold ${
            tab === "bank"
              ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]"
              : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"
          }`}
        >
          Bank reconciliation <span className="font-num text-[var(--ink-muted)]">{transactions.length}</span>
        </button>
      </div>

      {tab === "invoices" && (
        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
            <div>
              <h2 className="font-display text-[16.5px] font-semibold">Sales invoices</h2>
              <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Raised against landlord clients — reconciled against the bank feed below</div>
            </div>
            <button
              onClick={() => setInvoiceFormOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
            >
              <PlusIcon />
              New invoice
            </button>
          </div>

          {invoiceFormOpen && (
            <NewInvoiceForm
              onCreated={(invoice) => {
                setInvoices((prev) => [...prev, { ...invoice, isOverdue: false, daysOverdue: 0 }]);
                setInvoiceFormOpen(false);
                router.refresh();
              }}
              onCancel={() => setInvoiceFormOpen(false)}
            />
          )}

          <div>
            {invoices.map((inv, i) => {
              const styleKey = inv.isOverdue ? "overdue" : inv.status;
              const s = STATUS_STYLES[styleKey];
              return (
                <div
                  key={inv.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${
                    i === invoices.length - 1 ? "" : "border-b border-[var(--border)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-num text-[13px] font-bold">{inv.invoice_number}</span>
                      <span className="text-[13.5px] font-semibold">{inv.customer_name}</span>
                      <span
                        className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                        style={{ background: s.bg, color: s.ink }}
                      >
                        {s.label}{inv.isOverdue ? ` · ${inv.daysOverdue}d` : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-muted)]">
                      Issued {inv.issue_date} &middot; due {inv.due_date}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-num text-[14px] font-semibold">{gbp(inv.total)}</span>
                    {inv.status === "draft" && (
                      <button
                        disabled={busyId === inv.id}
                        onClick={() => setInvoiceStatus(inv.id, "sent")}
                        className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
                      >
                        Send
                      </button>
                    )}
                    {inv.status === "sent" && (
                      <>
                        <button
                          disabled={busyId === inv.id}
                          onClick={() => payByCard(inv.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
                          title="Simulates a successful card payment — a real gateway isn't wired up in this demo"
                        >
                          <CardIcon />
                          Pay by card
                        </button>
                        <button
                          disabled={busyId === inv.id}
                          onClick={() => setInvoiceStatus(inv.id, "paid")}
                          className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
                        >
                          Mark paid
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "quotes" && (
        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
            <div>
              <h2 className="font-display text-[16.5px] font-semibold">Quotes</h2>
              <div className="mt-0.5 text-xs text-[var(--ink-muted)]">An accepted quote converts straight into a draft invoice, line items included</div>
            </div>
            <button
              onClick={() => setQuoteFormOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
            >
              <PlusIcon />
              New quote
            </button>
          </div>

          {quoteFormOpen && (
            <NewQuoteForm
              onCreated={(quote) => {
                setQuotes((prev) => [...prev, quote]);
                setQuoteFormOpen(false);
                router.refresh();
              }}
              onCancel={() => setQuoteFormOpen(false)}
            />
          )}

          <div>
            {quotes.map((q, i) => {
              const s = QUOTE_STATUS_STYLES[q.status];
              return (
                <div
                  key={q.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${
                    i === quotes.length - 1 ? "" : "border-b border-[var(--border)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-num text-[13px] font-bold">{q.quote_number}</span>
                      <span className="text-[13.5px] font-semibold">{q.customer_name}</span>
                      <span
                        className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide"
                        style={{ background: s.bg, color: s.ink }}
                      >
                        {s.label}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-muted)]">
                      Issued {q.issue_date} &middot; expires {q.expiry_date}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-num text-[14px] font-semibold">{gbp(q.total)}</span>
                    {q.status === "draft" && (
                      <button
                        disabled={busyId === q.id}
                        onClick={() => setQuoteStatus(q.id, "sent")}
                        className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
                      >
                        Send
                      </button>
                    )}
                    {q.status === "sent" && (
                      <>
                        <button
                          disabled={busyId === q.id}
                          onClick={() => setQuoteStatus(q.id, "accepted")}
                          className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
                        >
                          Accepted
                        </button>
                        <button
                          disabled={busyId === q.id}
                          onClick={() => setQuoteStatus(q.id, "declined")}
                          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                        >
                          Declined
                        </button>
                      </>
                    )}
                    {q.status === "accepted" && (
                      <button
                        disabled={busyId === q.id}
                        onClick={() => convertQuote(q.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
                      >
                        Convert to invoice
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "bank" && (
        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="border-b border-[var(--border)] px-[18px] py-[15px]">
            <h2 className="font-display text-[16.5px] font-semibold">Connected account feed</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Open Banking &middot; unmatched credits are checked against open invoices automatically</div>
          </div>
          <div>
            {transactions.map((t, i) => {
              const suggestedInvoiceId = suggestions[t.id];
              const suggestedInvoice = suggestedInvoiceId ? invoiceById.get(suggestedInvoiceId) : null;
              const matchedInvoice = t.matched_invoice_id ? invoiceById.get(t.matched_invoice_id) : null;
              return (
                <div
                  key={t.id}
                  className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${
                    i === transactions.length - 1 ? "" : "border-b border-[var(--border)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{t.description}</span>
                      {t.category && (
                        <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-[7px] py-0.5 text-[10.5px] font-semibold text-[var(--ink-secondary)]">
                          {t.category}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-muted)]">
                      {t.txn_date}
                      {matchedInvoice && ` · matched to ${matchedInvoice.invoice_number} — ${matchedInvoice.customer_name}`}
                      {!matchedInvoice && t.matched_bill_id && " · matched to a supplier bill"}
                      {!matchedInvoice && !t.matched_bill_id && t.matched_payroll_run_id && " · matched to payroll run"}
                      {!matchedInvoice && !t.matched_bill_id && !t.matched_payroll_run_id && suggestedInvoice && ` · suggested match: ${suggestedInvoice.invoice_number} — ${suggestedInvoice.customer_name}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="font-num text-[14px] font-semibold"
                      style={{ color: t.direction === "credit" ? "var(--good-ink)" : "var(--ink)" }}
                    >
                      {t.direction === "credit" ? "+" : "−"}
                      {gbp(t.amount)}
                    </span>
                    {t.status === "matched" && t.matched_invoice_id && (
                      <button
                        disabled={busyId === t.id}
                        onClick={() => undoMatch(t.id)}
                        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)] disabled:opacity-50"
                      >
                        Unmatch
                      </button>
                    )}
                    {t.status === "unmatched" && suggestedInvoiceId && (
                      <button
                        disabled={busyId === t.id}
                        onClick={() => confirmMatch(t.id, suggestedInvoiceId)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                        Confirm match
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function NewInvoiceForm({ onCreated, onCancel }: { onCreated: (invoice: Invoice) => void; onCancel: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [items, setItems] = useState<NewItem[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const vat = subtotal * 0.2;

  function updateItem(index: number, patch: Partial<NewItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function submit() {
    setError(null);
    if (!customerName.trim()) return setError("Customer name is required.");
    if (!dueDate.trim()) return setError("Due date is required.");
    const cleanItems = items
      .filter((it) => it.description.trim())
      .map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity) || 0, unitPrice: Number(it.unitPrice) || 0 }));
    if (!cleanItems.length) return setError("Add at least one line item.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/ledger/invoices/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, customerEmail: customerEmail || null, dueDate, vatRate: 20, items: cleanItems }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onCreated(data.invoice as Invoice);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LineItemForm
      title="New invoice"
      customerName={customerName}
      setCustomerName={setCustomerName}
      customerEmail={customerEmail}
      setCustomerEmail={setCustomerEmail}
      dateLabel="Due date"
      dateValue={dueDate}
      setDateValue={setDueDate}
      datePlaceholder="e.g. 24 Sep 2026"
      items={items}
      updateItem={updateItem}
      setItems={setItems}
      subtotal={subtotal}
      vat={vat}
      error={error}
      submitting={submitting}
      submitLabel="Create draft invoice"
      onSubmit={submit}
      onCancel={onCancel}
    />
  );
}

function NewQuoteForm({ onCreated, onCancel }: { onCreated: (quote: Quote) => void; onCancel: () => void }) {
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [items, setItems] = useState<NewItem[]>([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const vat = subtotal * 0.2;

  function updateItem(index: number, patch: Partial<NewItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function submit() {
    setError(null);
    if (!customerName.trim()) return setError("Customer name is required.");
    if (!expiryDate.trim()) return setError("Expiry date is required.");
    const cleanItems = items
      .filter((it) => it.description.trim())
      .map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity) || 0, unitPrice: Number(it.unitPrice) || 0 }));
    if (!cleanItems.length) return setError("Add at least one line item.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/ledger/quotes/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, customerEmail: customerEmail || null, expiryDate, items: cleanItems }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      onCreated(data.quote as Quote);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <LineItemForm
      title="New quote"
      customerName={customerName}
      setCustomerName={setCustomerName}
      customerEmail={customerEmail}
      setCustomerEmail={setCustomerEmail}
      dateLabel="Expiry date"
      dateValue={expiryDate}
      setDateValue={setExpiryDate}
      datePlaceholder="e.g. 5 Oct 2026"
      items={items}
      updateItem={updateItem}
      setItems={setItems}
      subtotal={subtotal}
      vat={vat}
      error={error}
      submitting={submitting}
      submitLabel="Create draft quote"
      onSubmit={submit}
      onCancel={onCancel}
    />
  );
}

/** Shared line-item form body for both New invoice and New quote — same shape, different endpoint. */
function LineItemForm({
  customerName,
  setCustomerName,
  customerEmail,
  setCustomerEmail,
  dateLabel,
  dateValue,
  setDateValue,
  datePlaceholder,
  items,
  updateItem,
  setItems,
  subtotal,
  vat,
  error,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  customerName: string;
  setCustomerName: (v: string) => void;
  customerEmail: string;
  setCustomerEmail: (v: string) => void;
  dateLabel: string;
  dateValue: string;
  setDateValue: (v: string) => void;
  datePlaceholder: string;
  items: NewItem[];
  updateItem: (index: number, patch: Partial<NewItem>) => void;
  setItems: Dispatch<SetStateAction<NewItem[]>>;
  subtotal: number;
  vat: number;
  error: string | null;
  submitting: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[16px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-[var(--ink-secondary)]">
          Customer name
          <input
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="e.g. Bellcourt Estates Ltd"
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] font-normal text-[var(--ink)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-[var(--ink-secondary)]">
          Customer email (optional)
          <input
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="accounts@example.co.uk"
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] font-normal text-[var(--ink)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-[var(--ink-secondary)]">
          {dateLabel}
          <input
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            placeholder={datePlaceholder}
            className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] font-normal text-[var(--ink)]"
          />
        </label>
      </div>

      <div className="mt-4">
        <div className="mb-1.5 text-[12.5px] font-semibold text-[var(--ink-secondary)]">Line items</div>
        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_100px_auto] items-center gap-2">
              <input
                value={it.description}
                onChange={(e) => updateItem(i, { description: e.target.value })}
                placeholder="Description"
                className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]"
              />
              <input
                value={it.quantity}
                onChange={(e) => updateItem(i, { quantity: e.target.value })}
                placeholder="Qty"
                inputMode="decimal"
                className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[13px] text-[var(--ink)]"
              />
              <input
                value={it.unitPrice}
                onChange={(e) => updateItem(i, { unitPrice: e.target.value })}
                placeholder="Unit £"
                inputMode="decimal"
                className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[13px] text-[var(--ink)]"
              />
              <button
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={items.length === 1}
                className="rounded-lg px-2 py-2 text-[12px] font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => setItems((prev) => [...prev, emptyItem()])}
          className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--accent-strong)]"
        >
          <PlusIcon className="h-3 w-3" />
          Add line
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3.5">
        <div className="text-[12.5px] text-[var(--ink-secondary)]">
          Subtotal <span className="font-num font-semibold">{gbp(subtotal)}</span> &middot; VAT (20%){" "}
          <span className="font-num font-semibold">{gbp(vat)}</span> &middot; Total{" "}
          <span className="font-num font-semibold text-[var(--ink)]">{gbp(subtotal + vat)}</span>
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
          <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting}
            className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {submitting ? "Creating…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
