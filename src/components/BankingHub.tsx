"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gbp } from "@/lib/format";
import type { BankRule, StatementLineView } from "@/lib/banking/bank";

type Account = { code: string; name: string };

async function post(url: string, body?: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

const btn = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50";
const primary = "rounded-lg bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50";
const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]";

export function StatementImport() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      if (file.size > 5_000_000) throw new Error("That file is too large — export a shorter date range.");
      const r = await post("/api/bank/import", { filename: file.name, content: await file.text() });
      setMessage({
        ok: true,
        text: `Imported ${r.imported} of ${r.lines} lines${r.duplicates ? ` (${r.duplicates} already imported)` : ""}.${r.errors.length ? ` Skipped: ${r.errors.slice(0, 3).join(" ")}` : ""}`,
      });
      router.refresh();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Import failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={`${primary} cursor-pointer self-start`}>
        {busy ? "Importing…" : "Upload statement (CSV or OFX)"}
        <input
          type="file"
          accept=".csv,.ofx,.qfx,text/csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </label>
      <div className="text-[11.5px] text-[var(--ink-muted)]">
        Export a statement from your online banking. Uploading the same period twice is safe — lines already imported are skipped.
      </div>
      {message && <div className="text-[12.5px]" style={{ color: message.ok ? "var(--good-ink)" : "var(--critical-ink)" }}>{message.text}</div>}
    </div>
  );
}

export function AutoReconcileButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        className={primary}
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await post("/api/bank/auto");
            setText(r.reconciled ? `Reconciled ${r.reconciled} line${r.reconciled === 1 ? "" : "s"}; ${r.remaining} need a look.` : "Nothing certain enough to match automatically.");
            router.refresh();
          } catch (e) {
            setText(e instanceof Error ? e.message : "Failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Matching…" : "Auto-reconcile"}
      </button>
      {text && <span className="text-[12px] text-[var(--ink-secondary)]">{text}</span>}
    </div>
  );
}

export function OpeningBalanceButton({ amount, date }: { amount: number; date: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        className={btn}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await post("/api/bank/opening-balance");
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        Use {gbp(amount)} on {date} as the opening balance
      </button>
      {error && <span className="text-[12px] text-[var(--critical-ink)]">{error}</span>}
    </span>
  );
}

export function StatementLineRow({ line, accounts }: { line: StatementLineView; accounts: Account[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState("");
  const [vatRate, setVatRate] = useState("0");
  const [error, setError] = useState<string | null>(null);

  async function act(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await post(url, body);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  const credit = line.amount > 0;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] px-[18px] py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold">{line.description}</div>
        <div className="font-num mt-0.5 text-[11.5px] text-[var(--ink-muted)]">
          {line.date}
          {line.source === "demo" ? " · sample feed" : ""}
        </div>
        {line.status === "matched" ? (
          <div className="mt-1 text-[12px] text-[var(--good-ink)]">✓ {line.matchedLabel}</div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {line.suggestions.map((s) => (
              <button
                key={`${s.kind}:${s.id}`}
                className={s.confidence === "high" ? primary : btn}
                disabled={busy}
                onClick={() =>
                  act("/api/bank/reconcile", {
                    lineId: line.id,
                    target: s.kind === "rule" ? { kind: "account", accountCode: s.accountCode, ruleId: s.id } : { kind: s.kind, id: s.id },
                  })
                }
              >
                {s.label}
              </button>
            ))}
            <select className={input} value={account} onChange={(e) => setAccount(e.target.value)}>
              <option value="">{line.suggestions.length ? "…or post to an account" : "Post to an account…"}</option>
              {accounts.map((a) => (
                <option key={a.code} value={a.code}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
            {account && (
              <>
                <select className={input} value={vatRate} onChange={(e) => setVatRate(e.target.value)} title="VAT included in this amount">
                  <option value="0">No VAT</option>
                  <option value="20">incl. VAT 20%</option>
                  <option value="5">incl. VAT 5%</option>
                </select>
                <button
                  className={btn}
                  disabled={busy}
                  onClick={() => act("/api/bank/reconcile", { lineId: line.id, target: { kind: "account", accountCode: account, vatRate: Number(vatRate) } })}
                >
                  Post
                </button>
              </>
            )}
          </div>
        )}
        {error && <div className="mt-1 text-[12px] text-[var(--critical-ink)]">{error}</div>}
      </div>
      <div className="flex items-center gap-2">
        <span className="font-num text-[14px] font-semibold" style={{ color: credit ? "var(--good-ink)" : undefined }}>
          {credit ? "+" : "−"}
          {gbp(Math.abs(line.amount))}
        </span>
        {line.status === "matched" && line.source === "import" && (
          <button className="rounded-md px-2 py-1 text-[11.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]" disabled={busy} onClick={() => act("/api/bank/unreconcile", { lineId: line.id })}>
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

export function BankRules({ rules, accounts }: { rules: BankRule[]; accounts: Account[] }) {
  const router = useRouter();
  const [contains, setContains] = useState("");
  const [direction, setDirection] = useState<"any" | "credit" | "debit">("debit");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await post(url, body);
      setContains("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {rules.length > 0 && (
        <div className="flex flex-col divide-y divide-[var(--border)] text-[12.5px]">
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 py-1.5">
              <span>
                Description contains <strong>&ldquo;{r.contains}&rdquo;</strong>
                {r.direction !== "any" ? ` (money ${r.direction === "credit" ? "in" : "out"})` : ""} → {r.account_code} {r.account_name}
              </span>
              <button className="rounded-md px-2 py-1 text-[11.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]" disabled={busy} onClick={() => act("/api/bank/rules/delete", { id: r.id })}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        If description contains
        <input className={input} value={contains} onChange={(e) => setContains(e.target.value)} placeholder="e.g. AWS" />
        <select className={input} value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
          <option value="debit">money out</option>
          <option value="credit">money in</option>
          <option value="any">either way</option>
        </select>
        post to
        <select className={input} value={account} onChange={(e) => setAccount(e.target.value)}>
          <option value="">choose account…</option>
          {accounts.map((a) => (
            <option key={a.code} value={a.code}>
              {a.code} {a.name}
            </option>
          ))}
        </select>
        <button className={btn} disabled={busy || !contains || !account} onClick={() => act("/api/bank/rules/create", { contains, direction, accountCode: account })}>
          Add rule
        </button>
      </div>
      {error && <div className="text-[12px] text-[var(--critical-ink)]">{error}</div>}
    </div>
  );
}
