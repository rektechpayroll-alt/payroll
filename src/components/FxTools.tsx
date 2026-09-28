"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { postOrReport } from "@/lib/client-actions";
import { gbp } from "@/lib/format";

const btn = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50";
const primary = "rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50";

/** "≈ £950.12 at the ECB rate for 25 Sep" under a foreign-currency amount. */
export function FxHint({ currency, amount }: { currency: string; amount: number }) {
  const [rate, setRate] = useState<{ rate: number; date: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (currency === "GBP") return;
    let live = true;
    setRate(null);
    setFailed(false);
    fetch(`/api/fx/rate?currency=${encodeURIComponent(currency)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((r) => live && setRate(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [currency]);
  if (currency === "GBP") return null;
  if (failed) return <span className="text-[11.5px] text-[var(--critical-ink)]">No exchange rate available right now.</span>;
  if (!rate) return <span className="text-[11.5px] text-[var(--ink-muted)]">Fetching the exchange rate…</span>;
  return (
    <span className="text-[11.5px] text-[var(--ink-muted)]">
      ≈ {gbp(Math.round(amount * rate.rate * 100) / 100)} at the ECB rate for {rate.date} (1 {currency} = £{rate.rate.toFixed(4)}) — the rate on the document date is used
    </span>
  );
}

export function RefreshRatesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={btn}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        if (await postOrReport("/api/fx/refresh", {})) router.refresh();
        setBusy(false);
      }}
    >
      {busy ? "Fetching…" : "Fetch latest rates"}
    </button>
  );
}

export function RevalueForm({ today }: { today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      Revalue at
      <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} className="font-num rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5" />
      <button
        className={primary}
        disabled={busy || !date}
        onClick={async () => {
          setBusy(true);
          if (await postOrReport("/api/fx/revalue", { date })) router.refresh();
          setBusy(false);
        }}
      >
        Post revaluation
      </button>
    </div>
  );
}
