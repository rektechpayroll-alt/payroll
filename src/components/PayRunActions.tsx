"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PayRunActions({ runId }: { runId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"recalc" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function call(kind: "recalc" | "delete") {
    setBusy(kind);
    setMessage(null);
    try {
      const res = await fetch(`/api/payroll/runs/${kind === "recalc" ? "recalculate" : "delete"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      if (kind === "delete") {
        router.push("/dashboard/payroll");
      } else {
        setMessage("Recalculated with everyone's latest pay details.");
      }
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const btn = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {message && <span className="text-[12px] text-[var(--ink-secondary)]">{message}</span>}
      <button className={btn} disabled={!!busy} onClick={() => call("recalc")}>
        {busy === "recalc" ? "Recalculating…" : "Recalculate"}
      </button>
      {confirmDelete ? (
        <>
          <span className="text-[12px] text-[var(--ink-secondary)]">Delete this draft run?</span>
          <button className={`${btn} text-[var(--critical-ink)]`} disabled={!!busy} onClick={() => call("delete")}>
            {busy === "delete" ? "Deleting…" : "Yes, delete"}
          </button>
          <button className={btn} onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button className={btn} disabled={!!busy} onClick={() => setConfirmDelete(true)}>
          Delete draft
        </button>
      )}
    </div>
  );
}
