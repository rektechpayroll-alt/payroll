"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import { StatRow, StatTile } from "@/components/StatTile";
import type { FixedAsset } from "@/lib/queries";
import { withDepreciation, type AssetRegisterSummary } from "@/lib/assets";

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-3.5 w-3.5"}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function AssetsHub({ initialAssets, summary }: { initialAssets: FixedAsset[]; summary: AssetRegisterSummary }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initialAssets);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div>
      <StatRow>
        <StatTile label="Purchase cost" value={gbp(summary.totalCost)} meta={<span>{assets.length} assets on the register</span>} />
        <StatTile label="Accumulated depreciation" value={gbp(summary.totalAccumulatedDepreciation)} meta={<span>straight-line, computed as of today</span>} />
        <StatTile label="Net book value" value={gbp(summary.totalNetBookValue)} meta={<span>cost less accumulated depreciation</span>} />
      </StatRow>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px]">
          <div>
            <h2 className="font-display text-[16.5px] font-semibold">Fixed asset register</h2>
            <div className="mt-0.5 text-xs text-[var(--ink-muted)]">Straight-line depreciation over each asset&rsquo;s useful life</div>
          </div>
          <button onClick={() => setFormOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]">
            <PlusIcon />
            New asset
          </button>
        </div>

        {formOpen && (
          <NewAssetForm
            onCreated={(asset) => {
              setAssets((prev) => [...prev, asset]);
              setFormOpen(false);
              router.refresh();
            }}
            onCancel={() => setFormOpen(false)}
          />
        )}

        <div>
          {assets.map((raw, i) => {
            const a = withDepreciation(raw);
            const pct = Math.min(100, Math.max(0, a.percentDepreciated));
            return (
              <div key={a.id} className={`px-[18px] py-[13px] ${i === assets.length - 1 ? "" : "border-b border-[var(--border)]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-semibold">{a.name}</span>
                      <span className="rounded-[6px] border border-[var(--border)] bg-[var(--surface-2)] px-[7px] py-0.5 text-[10.5px] font-semibold text-[var(--ink-secondary)]">{a.category}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-muted)]">Purchased {a.purchase_date} &middot; {a.useful_life_years}yr useful life &middot; {gbp(a.annualDepreciation)}/yr</div>
                  </div>
                  <span className="font-num text-[14px] font-semibold">{gbp(a.netBookValue)} NBV</span>
                </div>
                <div className="mt-2.5 h-[6px] overflow-hidden rounded-full bg-[var(--surface-2)]">
                  <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1.5 text-[11.5px] text-[var(--ink-muted)]">
                  <span className="font-num">{gbp(a.accumulatedDepreciation)}</span> depreciated of <span className="font-num">{gbp(a.purchase_cost)}</span> ({a.percentDepreciated.toFixed(0)}%)
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function NewAssetForm({ onCreated, onCancel }: { onCreated: (asset: FixedAsset) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [cost, setCost] = useState("");
  const [life, setLife] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim() || !category.trim() || !purchaseDate.trim()) return setError("Name, category and purchase date are required.");
    if (!(Number(cost) > 0)) return setError("Purchase cost must be positive.");
    if (!(Number(life) > 0)) return setError("Useful life must be positive.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/assets/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, purchaseDate, purchaseCost: Number(cost), usefulLifeYears: Number(life) }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? "Something went wrong.");
      onCreated(data.asset as FixedAsset);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-[18px] py-[16px]">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Asset name" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <input value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} placeholder="Purchase date, e.g. 1 Oct 2026" className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        <div className="grid grid-cols-2 gap-3">
          <input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Cost £" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
          <input value={life} onChange={(e) => setLife(e.target.value)} placeholder="Useful life (yrs)" inputMode="decimal" className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[13px] text-[var(--ink)]" />
        </div>
      </div>
      <div className="mt-3.5 flex items-center justify-end gap-2">
        {error && <span className="mr-auto text-[12px] font-semibold text-[var(--critical-ink)]">{error}</span>}
        <button onClick={onCancel} className="rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">Cancel</button>
        <button onClick={submit} disabled={submitting} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
          {submitting ? "Creating…" : "Add asset"}
        </button>
      </div>
    </div>
  );
}
