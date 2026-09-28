"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Books the net pay leaving the bank (clears Net wages payable) once the payment file has been paid. */
export function WagesPaidButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function record() {
    setBusy(true);
    const res = await fetch("/api/payroll/runs/wages-paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't record the payment.");
    router.refresh();
  }
  return (
    <>
      <button
        disabled={busy}
        onClick={record}
        className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
      >
        {busy ? "Recording…" : "Mark wages as paid"}
      </button>
      {error && <span className="text-[12px] text-[var(--critical-ink)]">{error}</span>}
    </>
  );
}
