"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RtiSubmission } from "@/lib/rti/submissions";

const STATUS: Record<string, { label: string; bg: string; ink: string }> = {
  submitted: { label: "Processing", bg: "var(--warning-soft)", ink: "var(--warning-ink)" },
  accepted: { label: "Accepted", bg: "var(--good-soft)", ink: "var(--good-ink)" },
  rejected: { label: "Rejected", bg: "var(--critical-soft)", ink: "var(--critical-ink)" },
  error: { label: "Not sent", bg: "var(--critical-soft)", ink: "var(--critical-ink)" },
};

export function RtiSubmissionList({ submissions }: { submissions: RtiSubmission[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function poll(id: string) {
    setBusy(id);
    try {
      await fetch("/api/rti/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!submissions.length) return <div className="text-[12.5px] text-[var(--ink-muted)]">Nothing sent to HMRC yet.</div>;
  return (
    <div className="flex flex-col divide-y divide-[var(--border)]">
      {submissions.map((s) => {
        const st = STATUS[s.status] ?? STATUS.error;
        return (
          <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5 text-[12.5px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.kind}</span>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: st.bg, color: st.ink }}>
                  {st.label}
                </span>
                {s.test_in_live && <span className="text-[11px] text-[var(--ink-muted)]">test only</span>}
                <span className="text-[11px] text-[var(--ink-muted)]">
                  {s.tax_year}
                  {s.tax_month ? ` · month ${s.tax_month}` : ""} · {s.created_at} · HMRC {s.environment} service
                </span>
              </div>
              {s.irmark && <div className="font-num mt-0.5 break-all text-[11px] text-[var(--ink-muted)]">IRmark {s.irmark}</div>}
              {(s.errors ?? []).map((e, i) => (
                <div key={i} className="mt-1 max-w-[70ch] text-[11.5px] text-[var(--critical-ink)]">
                  {e.number ? `${e.number}: ` : ""}
                  {e.text}
                </div>
              ))}
            </div>
            {s.status === "submitted" && (
              <button
                disabled={busy === s.id}
                onClick={() => poll(s.id)}
                className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                {busy === s.id ? "Checking…" : "Check status"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
