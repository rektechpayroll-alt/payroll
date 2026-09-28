"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Government Gateway credentials are sent for this one submission and never stored. */
export function RtiSubmitForm({ endpoint, payload, disabled, label }: { endpoint: string; payload: Record<string, unknown>; disabled?: string | null; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [senderId, setSenderId] = useState("");
  const [password, setPassword] = useState("");
  const [testInLive, setTestInLive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, senderId, password, testInLive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Submission failed.");
      const status = data.submission?.status;
      setMessage({
        ok: status !== "rejected" && status !== "error",
        text:
          status === "accepted"
            ? "HMRC accepted the submission."
            : status === "submitted"
              ? "Sent — HMRC is processing it. Check its status below in a minute."
              : `HMRC rejected it: ${data.submission?.errors?.map((x: { text: string }) => x.text).join(" ") ?? "see below"}`,
      });
      setPassword("");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Submission failed." });
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]";
  if (disabled) return <div className="text-[12.5px] text-[var(--ink-muted)]">{disabled}</div>;
  return (
    <div className="flex flex-col gap-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="self-start rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
        >
          {label}
        </button>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
              Government Gateway user ID
              <input className={input} value={senderId} onChange={(e) => setSenderId(e.target.value)} autoComplete="username" required />
            </label>
            <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
              Password
              <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
          </div>
          <label className="flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" className="mt-0.5" checked={testInLive} onChange={(e) => setTestInLive(e.target.checked)} />
            <span>
              <strong>Test only (Test-in-Live)</strong> — HMRC checks the submission but doesn&rsquo;t record it. Untick to file for real.
            </span>
          </label>
          <div className="text-[11.5px] text-[var(--ink-muted)]">Your credentials are sent to HMRC for this submission only and are never stored by Verity.</div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50">
              {busy ? "Sending to HMRC…" : testInLive ? "Send test submission" : "File with HMRC"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface)]">
              Cancel
            </button>
          </div>
        </form>
      )}
      {message && <div className="text-[12.5px]" style={{ color: message.ok ? "var(--good-ink)" : "var(--critical-ink)" }}>{message.text}</div>}
    </div>
  );
}
