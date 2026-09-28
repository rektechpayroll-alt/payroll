"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VatSettings } from "@/lib/vat/returns";

const btn = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50";
const primary = "rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50";
const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

/** Device details HMRC's fraud prevention rules require, gathered in the browser. */
function deviceInfo() {
  let deviceId = "";
  try {
    deviceId = localStorage.getItem("verity-device-id") ?? "";
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem("verity-device-id", deviceId);
    }
  } catch {
    deviceId = crypto.randomUUID();
  }
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return {
    deviceId,
    userAgent: navigator.userAgent,
    timezone: `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`,
    screens: [{ width: screen.width, height: screen.height, scalingFactor: window.devicePixelRatio || 1, colourDepth: screen.colorDepth }],
    windowSize: { width: window.innerWidth, height: window.innerHeight },
  };
}

export function VatSettingsForm({ settings }: { settings: VatSettings }) {
  const router = useRouter();
  const [f, setF] = useState({ registered: settings.vat_registered, vatNumber: settings.vat_number ?? "", scheme: settings.vat_scheme, stagger: settings.vat_stagger });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3 text-[12.5px]">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={f.registered} onChange={(e) => setF({ ...f, registered: e.target.checked })} />
        This business is VAT registered
      </label>
      {f.registered && (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 font-semibold text-[var(--ink-secondary)]">
            VAT number
            <input className={`${input} font-num`} value={f.vatNumber} onChange={(e) => setF({ ...f, vatNumber: e.target.value })} placeholder="GB123456789" />
          </label>
          <label className="flex flex-col gap-1 font-semibold text-[var(--ink-secondary)]">
            Accounting scheme
            <select className={input} value={f.scheme} onChange={(e) => setF({ ...f, scheme: e.target.value as "accrual" | "cash" })}>
              <option value="accrual">Standard (invoice date)</option>
              <option value="cash">Cash accounting (payment date)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 font-semibold text-[var(--ink-secondary)]">
            VAT quarters end
            <select className={input} value={f.stagger} onChange={(e) => setF({ ...f, stagger: Number(e.target.value) as 1 | 2 | 3 })}>
              <option value={1}>Mar, Jun, Sep, Dec</option>
              <option value={2}>Apr, Jul, Oct, Jan</option>
              <option value={3}>May, Aug, Nov, Feb</option>
            </select>
          </label>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button
          className={primary}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await post("/api/vat/settings", f);
              setMsg({ ok: true, text: "Saved." });
              router.refresh();
            } catch (e) {
              setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
            } finally {
              setBusy(false);
            }
          }}
        >
          Save VAT settings
        </button>
        {msg && <span style={{ color: msg.ok ? "var(--good-ink)" : "var(--critical-ink)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function FinaliseButton({ start, end }: { start: string; end: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!confirm) return <button className={primary} onClick={() => setConfirm(true)}>Finalise return</button>;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      Finalising saves these figures and locks {start} – {end}: nothing dated in it can change afterwards.
      <button
        className={primary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await post("/api/vat/finalise", { start, end });
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Finalising…" : "Yes, finalise"}
      </button>
      <button className={btn} onClick={() => setConfirm(false)}>
        Cancel
      </button>
      {error && <span className="text-[var(--critical-ink)]">{error}</span>}
    </div>
  );
}

type Obligation = { periodKey: string; start: string; end: string; due: string; status: "O" | "F" };

export function HmrcFiling({ returnId, start, end, connected, configProblem }: { returnId: string; start: string; end: string; connected: boolean; configProblem: string | null }) {
  const router = useRouter();
  const [obligations, setObligations] = useState<Obligation[] | null>(null);
  const [periodKey, setPeriodKey] = useState("");
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!connected) return;
    post("/api/vat/hmrc/obligations", { device: deviceInfo() })
      .then((d) => {
        setObligations(d.obligations);
        const match = (d.obligations as Obligation[]).find((o) => o.start === start && o.end === end && o.status === "O");
        if (match) setPeriodKey(match.periodKey);
      })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [connected, start, end]);

  if (configProblem) return <div className="text-[12.5px] text-[var(--ink-muted)]">{configProblem}</div>;
  if (!connected) {
    return (
      <a href="/api/vat/hmrc/connect" className={primary}>
        Connect to HMRC to file
      </a>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-[12.5px]">
      <label className="flex items-center gap-2">
        HMRC period
        <select className={input} value={periodKey} onChange={(e) => setPeriodKey(e.target.value)}>
          <option value="">{obligations ? "Choose…" : "Loading from HMRC…"}</option>
          {(obligations ?? [])
            .filter((o) => o.status === "O")
            .map((o) => (
              <option key={o.periodKey} value={o.periodKey}>
                {o.start} – {o.end} (due {o.due})
              </option>
            ))}
        </select>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5" checked={declared} onChange={(e) => setDeclared(e.target.checked)} />
        <span>
          When you submit this VAT information you are making a legal declaration that the information is true and complete. A false declaration can result in
          prosecution.
        </span>
      </label>
      <button
        className={`${primary} self-start`}
        disabled={busy || !periodKey || !declared}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await post("/api/vat/hmrc/submit", { returnId, periodKey, declaration: true, device: deviceInfo() });
            setMsg({ ok: true, text: `Filed with HMRC — receipt ${r.receiptId ?? "received"}.` });
            router.refresh();
          } catch (e) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "Failed." });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Filing…" : "Submit VAT return to HMRC"}
      </button>
      {msg && <div style={{ color: msg.ok ? "var(--good-ink)" : "var(--critical-ink)" }}>{msg.text}</div>}
    </div>
  );
}
