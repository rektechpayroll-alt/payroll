"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";
import type { InventoryItem } from "@/lib/queries";
import { isLowStock, type InventorySummary } from "@/lib/inventory";

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-2.5 w-2.5"}>
      <path d="M12 3l9 16H3L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4M12 17h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function InventoryHub({ initialItems, summary }: { initialItems: InventoryItem[]; summary: InventorySummary }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { change: string; reason: string }>>({});

  function draftFor(id: string) {
    return drafts[id] ?? { change: "", reason: "" };
  }

  async function adjust(id: string) {
    const d = draftFor(id);
    const change = Number(d.change);
    if (!change || !d.reason.trim()) return;
    setBusyId(id);
    try {
      const res = await fetch("/api/inventory/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id, change, reason: d.reason.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setItems((prev) => prev.map((it) => (it.id === id ? data.item : it)));
        setDrafts((prev) => ({ ...prev, [id]: { change: "", reason: "" } }));
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <StatRow>
        <StatTile label="Stock value" value={gbp(summary.totalValue)} meta={<span>{items.length} SKUs tracked</span>} />
        <StatTile
          label="Low stock"
          value={String(summary.lowStockCount)}
          meta={<span>at or below reorder level</span>}
          pill={
            summary.lowStockCount > 0
              ? { tone: "warn", icon: <WarnIcon />, text: "Reorder needed" }
              : { tone: "good", icon: <CheckIcon className="h-2.5 w-2.5" />, text: "All stocked" }
          }
        />
      </StatRow>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="border-b border-[var(--border)] px-[18px] py-[15px]">
          <h2 className="font-display text-[16.5px] font-semibold">Signage, merchandise & equipment</h2>
          <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Adjusting stock logs a movement — the quantity on hand is always derived from the movement log, never edited directly</div>
        </div>
        <div>
          {items.map((it, i) => {
            const low = isLowStock(it);
            const d = draftFor(it.id);
            return (
              <div key={it.id} className={`flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px] ${i === items.length - 1 ? "" : "border-b border-[var(--border)]"}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-num text-[12px] font-bold text-[var(--ink-muted)]">{it.sku}</span>
                    <span className="text-[13.5px] font-semibold">{it.name}</span>
                    <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-[7px] py-0.5 text-[10.5px] font-semibold text-[var(--ink-secondary)]">{it.category}</span>
                    {low && (
                      <span className="rounded-[6px] bg-[var(--warning-soft)] px-[7px] py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--warning-ink)]">Low stock</span>
                    )}
                  </div>
                  <div className="mt-1 text-[12px] text-[var(--ink-muted)]">
                    <span className="font-num font-semibold text-[var(--ink)]">{it.quantity_on_hand}</span> on hand &middot; reorder at {it.reorder_level} &middot; {gbp(it.unit_cost)}/unit
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    value={d.change}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [it.id]: { ...draftFor(it.id), change: e.target.value } }))}
                    placeholder="± qty"
                    inputMode="numeric"
                    className="font-num w-[64px] rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[12.5px] text-[var(--ink)]"
                  />
                  <input
                    value={d.reason}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [it.id]: { ...draftFor(it.id), reason: e.target.value } }))}
                    placeholder="Reason"
                    className="w-[160px] rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[12.5px] text-[var(--ink)]"
                  />
                  <button
                    disabled={busyId === it.id}
                    onClick={() => adjust(it.id)}
                    className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
                  >
                    Adjust
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
