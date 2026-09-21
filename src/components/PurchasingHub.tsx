"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";
import type { Bill, PurchaseOrder } from "@/lib/queries";
import type { BillWithStatus, PayablesSummary } from "@/lib/purchasing";

const BILL_STYLES: Record<string, { bg: string; ink: string; label: string }> = {
  unpaid: { bg: "var(--warning-soft)", ink: "var(--warning-ink)", label: "Unpaid" },
  overdue: { bg: "var(--critical-soft)", ink: "var(--critical-ink)", label: "Overdue" },
  paid: { bg: "var(--good-soft)", ink: "var(--good-ink)", label: "Paid" },
  void: { bg: "var(--surface-2)", ink: "var(--ink-muted)", label: "Void" },
};

const PO_STYLES: Record<string, { bg: string; ink: string; label: string }> = {
  draft: { bg: "var(--surface-2)", ink: "var(--ink-muted)", label: "Draft" },
  sent: { bg: "var(--warning-soft)", ink: "var(--warning-ink)", label: "Sent" },
  received: { bg: "var(--good-soft)", ink: "var(--good-ink)", label: "Received" },
  converted_to_bill: { bg: "var(--surface-2)", ink: "var(--ink-muted)", label: "Converted to bill" },
};

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-3.5 w-3.5"}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type NewItem = { description: string; quantity: string; unitPrice: string };

export function PurchasingHub({
  initialBills,
  initialPurchaseOrders,
  summary,
}: {
  initialBills: BillWithStatus[];
  initialPurchaseOrders: PurchaseOrder[];
  summary: PayablesSummary;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"bills" | "pos">("bills");
  const [bills, setBills] = useState(initialBills);
  const [pos, setPos] = useState(initialPurchaseOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [billFormOpen, setBillFormOpen] = useState(false);
  const [poFormOpen, setPoFormOpen] = useState(false);

  async function payBill(id: string) {
    setBusyId(id);
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, status: "paid", isOverdue: false, daysOverdue: 0 } : b)));
    try {
      await fetch("/api/purchasing/bills/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function setPoStatus(id: string, status: PurchaseOrder["status"]) {
    setBusyId(id);
    setPos((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    try {
      await fetch("/api/purchasing/purchase-orders/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function convertPo(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/purchasing/purchase-orders/convert", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const data = await res.json();
      if (res.ok) {
        setPos((prev) => prev.map((p) => (p.id === id ? data.purchaseOrder : p)));
        setBills((prev) => [...prev, { ...data.bill, isOverdue: false, daysOverdue: 0 }]);
        setTab("bills");
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <StatRow>
        <StatTile label="Unpaid bills" value={gbp(summary.unpaidTotal)} meta={<span>{summary.unpaidCount} bill{summary.unpaidCount === 1 ? "" : "s"} outstanding</span>} />
        <StatTile
          label="Overdue"
          value={gbp(summary.overdueTotal)}
          meta={<span>{summary.overdueCount} bill{summary.overdueCount === 1 ? "" : "s"} past due date</span>}
          pill={
            summary.overdueCount > 0
              ? { tone: "warn", icon: <PlusIcon className="h-2.5 w-2.5" />, text: "Needs paying" }
              : { tone: "good", icon: <CheckIcon className="h-2.5 w-2.5" />, text: "Nothing overdue" }
          }
        />
        <StatTile label="Purchase orders" value={String(pos.length)} meta={<span>{pos.filter((p) => p.status === "sent").length} awaiting delivery</span>} />
      </StatRow>

      <div className="mb-4 flex flex-wrap gap-[7px]">
        <button onClick={() => setTab("bills")} className={`rounded-full border px-[13px] py-[7px] text-[12.8px] font-semibold ${tab === "bills" ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"}`}>
          Bills <span className="font-num text-[var(--ink-muted)]">{bills.length}</span>
        </button>
        <button onClick={() => setTab("pos")} className={`rounded-full border px-[13px] py-[7px] text-[12.8px] font-semibold ${tab === "pos" ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent-strong)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--ink-secondary)]"}`}>
          Purchase orders <span className="font-num text-[var(--ink-muted)]">{pos.length}</span>
        </button>
      </div>

      {tab === "bills" && (
        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
            <div>
              <h2 className="font-display text-[16.5px] font-semibold">Supplier bills</h2>
              <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Paying a bill drops a matched debit onto the Verity Ledger bank feed</div>
            </div>
            <button onClick={() => setBillFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
              <PlusIcon />
              New bill
            </button>
          </div>

          {billFormOpen && (
            <NewBillForm
              onCreated={(bill) => {
                setBills((prev) => [...prev, { ...bill, isOverdue: false, daysOverdue: 0 }]);
                setBillFormOpen(false);
                router.refresh();
              }}
              onCancel={() => setBillFormOpen(false)}
            />
          )}

          <div>
            {bills.map((b, i) => {
              const s = BILL_STYLES[b.isOverdue ? "overdue" : b.status];
              return (
                <div key={b.id} className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${i === bills.length - 1 ? "" : "border-b border-[var(--border)]"}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-num text-[13px] font-bold">{b.bill_reference}</span>
                      <span className="text-[13.5px] font-semibold">{b.supplier_name}</span>
                      {b.category && <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-[7px] py-0.5 text-[10.5px] font-semibold text-[var(--ink-secondary)]">{b.category}</span>}
                      <span className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: s.bg, color: s.ink }}>
                        {s.label}{b.isOverdue ? ` · ${b.daysOverdue}d` : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-muted)]">Billed {b.bill_date} &middot; due {b.due_date}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-right">
                      <span className="font-num block text-[14px] font-semibold">{gbp(b.total)}</span>
                      {b.currency !== "GBP" && b.original_total != null && (
                        <span className="font-num block text-[10.5px] text-[var(--ink-muted)]">{b.currency} {b.original_total.toFixed(2)}</span>
                      )}
                    </span>
                    {b.status === "unpaid" && (
                      <button disabled={busyId === b.id} onClick={() => payBill(b.id)} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50">
                        Pay bill
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === "pos" && (
        <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
          <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
            <div>
              <h2 className="font-display text-[16.5px] font-semibold">Purchase orders</h2>
              <div className="mt-0.5 text-xs text-[var(--ink-muted)]">A received order converts into a real bill, total carried across</div>
            </div>
            <button onClick={() => setPoFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
              <PlusIcon />
              New purchase order
            </button>
          </div>

          {poFormOpen && (
            <NewPoForm
              onCreated={(po) => {
                setPos((prev) => [...prev, po]);
                setPoFormOpen(false);
                router.refresh();
              }}
              onCancel={() => setPoFormOpen(false)}
            />
          )}

          <div>
            {pos.map((p, i) => {
              const s = PO_STYLES[p.status];
              return (
                <div key={p.id} className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${i === pos.length - 1 ? "" : "border-b border-[var(--border)]"}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-num text-[13px] font-bold">{p.po_number}</span>
                      <span className="text-[13.5px] font-semibold">{p.supplier_name}</span>
                      <span className="rounded-[6px] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide" style={{ background: s.bg, color: s.ink }}>{s.label}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-muted)]">Ordered {p.order_date}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-num text-[14px] font-semibold">{gbp(p.total)}</span>
                    {p.status === "draft" && (
                      <button disabled={busyId === p.id} onClick={() => setPoStatus(p.id, "sent")} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50">
                        Send to supplier
                      </button>
                    )}
                    {p.status === "sent" && (
                      <button disabled={busyId === p.id} onClick={() => setPoStatus(p.id, "received")} className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50">
                        Mark received
                      </button>
                    )}
                    {p.status === "received" && (
                      <button disabled={busyId === p.id} onClick={() => convertPo(p.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
                        Convert to bill
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

const CURRENCIES = ["GBP", "USD", "EUR", "AED"] as const;

function NewBillForm({ onCreated, onCancel }: { onCreated: (bill: Bill) => void; onCancel: () => void }) {
  const [supplierName, setSupplierName] = useState("");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [total, setTotal] = useState("");
  const [currency, setCurrency] = useState<string>("GBP");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!supplierName.trim()) return setError("Supplier name is required.");
    if (!dueDate.trim()) return setError("Due date is required.");
    if (!(Number(total) > 0)) return setError("Total must be a positive amount.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/purchasing/bills/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierName, category: category || null, dueDate, total: Number(total), currency }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      onCreated(data.bill as Bill);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[16px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Supplier name" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] sm:col-span-2" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="Due date, e.g. 5 Oct 2026" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Total" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)] sm:col-span-3" />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]">
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="mt-3.5 flex items-center justify-end gap-2">
        {error && <span className="mr-auto text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
        <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">Cancel</button>
        <button onClick={submit} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
          {submitting ? "Creating…" : "Create bill"}
        </button>
      </div>
    </div>
  );
}

function NewPoForm({ onCreated, onCancel }: { onCreated: (po: PurchaseOrder) => void; onCancel: () => void }) {
  const [supplierName, setSupplierName] = useState("");
  const [items, setItems] = useState<NewItem[]>([{ description: "", quantity: "1", unitPrice: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);

  function updateItem(index: number, patch: Partial<NewItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  async function submit() {
    setError(null);
    if (!supplierName.trim()) return setError("Supplier name is required.");
    const cleanItems = items.filter((it) => it.description.trim()).map((it) => ({ description: it.description.trim(), quantity: Number(it.quantity) || 0, unitPrice: Number(it.unitPrice) || 0 }));
    if (!cleanItems.length) return setError("Add at least one line item.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/purchasing/purchase-orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierName, items: cleanItems }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      onCreated(data.purchaseOrder as PurchaseOrder);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[16px]">
      <input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Supplier name" className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
      <div className="mt-3 flex flex-col gap-2">
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-[1fr_70px_100px_auto] items-center gap-2">
            <input value={it.description} onChange={(e) => updateItem(i, { description: e.target.value })} placeholder="Description" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
            <input value={it.quantity} onChange={(e) => updateItem(i, { quantity: e.target.value })} placeholder="Qty" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[13px] text-[var(--ink)]" />
            <input value={it.unitPrice} onChange={(e) => updateItem(i, { unitPrice: e.target.value })} placeholder="Unit £" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-2 text-[13px] text-[var(--ink)]" />
            <button onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))} disabled={items.length === 1} className="rounded-lg px-2 py-2 text-[12px] font-semibold text-[var(--ink-muted)] hover:bg-[var(--surface)] disabled:opacity-30">Remove</button>
          </div>
        ))}
      </div>
      <button onClick={() => setItems((prev) => [...prev, { description: "", quantity: "1", unitPrice: "" }])} className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--accent-strong)]">
        <PlusIcon className="h-3 w-3" />
        Add line
      </button>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-3.5">
        <div className="text-[12.5px] text-[var(--ink-secondary)]">Total <span className="font-num font-semibold text-[var(--ink)]">{gbp(total)}</span></div>
        <div className="flex items-center gap-2">
          {error && <span className="text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
          <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">Cancel</button>
          <button onClick={submit} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
            {submitting ? "Creating…" : "Create purchase order"}
          </button>
        </div>
      </div>
    </div>
  );
}
