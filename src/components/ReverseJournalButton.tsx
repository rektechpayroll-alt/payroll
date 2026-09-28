"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReverseJournalButton({ journalId }: { journalId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function reverse() {
    setBusy(true);
    const res = await fetch("/api/ledger/journals/reverse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journalId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't reverse.");
    setConfirm(false);
    router.refresh();
  }
  const btn = "rounded-md px-2 py-1 text-[11.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50";
  if (error) return <span className="text-[11.5px] text-[var(--critical-ink)]">{error}</span>;
  return confirm ? (
    <span className="flex items-center gap-1 text-[11.5px]">
      Reverse it?
      <button className={`${btn} text-[var(--critical-ink)]`} disabled={busy} onClick={reverse}>
        {busy ? "…" : "Yes"}
      </button>
      <button className={btn} onClick={() => setConfirm(false)}>
        No
      </button>
    </span>
  ) : (
    <button className={`${btn} text-[var(--ink-secondary)]`} onClick={() => setConfirm(true)}>
      Reverse
    </button>
  );
}
