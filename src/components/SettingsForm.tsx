"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Company } from "@/lib/queries";

const PAY_SCHEDULES = ["Weekly + monthly", "Weekly", "Monthly", "4-weekly"];

function Toggle({ checked, onChange, label, note }: { checked: boolean; onChange: (v: boolean) => void; label: string; note: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <div className="text-[13.5px] font-semibold">{label}</div>
        <div className="text-[12px] text-[var(--ink-muted)]">{note}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 flex-none rounded-full transition-colors ${checked ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}

export function SettingsForm({ company }: { company: Company }) {
  const router = useRouter();
  const [paySchedule, setPaySchedule] = useState(company.pay_schedule);
  const [notifyOnFlag, setNotifyOnFlag] = useState(company.notify_on_flag);
  const [notifyOnApproval, setNotifyOnApproval] = useState(company.notify_on_approval);
  const [approvalMode, setApprovalMode] = useState<"manual" | "hybrid">(company.approval_mode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/company/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pay_schedule: paySchedule,
          notify_on_flag: notifyOnFlag,
          notify_on_approval: notifyOnApproval,
          approval_mode: approvalMode,
        }),
      });
      setSaved(true);
      router.refresh();
      window.setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
          <h2 className="font-display text-[14.5px] font-semibold">Company</h2>
        </div>
        <div className="flex flex-col gap-4 px-[18px] py-4">
          <div>
            <div className="text-[12px] font-semibold text-[var(--ink-secondary)]">Company name</div>
            <div className="mt-1 text-[13.5px]">{company.name}</div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-semibold text-[var(--ink-secondary)]">Pay schedule</span>
            <select
              value={paySchedule}
              onChange={(e) => setPaySchedule(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--accent)]"
            >
              {PAY_SCHEDULES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <div>
            <div className="mb-1.5 text-[12px] font-semibold text-[var(--ink-secondary)]">Approval mode</div>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] p-3">
                <input type="radio" checked={approvalMode === "manual"} onChange={() => setApprovalMode("manual")} className="mt-1" />
                <div>
                  <div className="text-[13px] font-semibold">Manual</div>
                  <div className="text-[12px] text-[var(--ink-secondary)]">Every run needs an explicit approval, exceptions or not.</div>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--border)] p-3">
                <input type="radio" checked={approvalMode === "hybrid"} onChange={() => setApprovalMode("hybrid")} className="mt-1" />
                <div>
                  <div className="text-[13px] font-semibold">Hybrid</div>
                  <div className="text-[12px] text-[var(--ink-secondary)]">Runs with zero flagged exceptions can auto-approve; anything flagged still needs a human.</div>
                </div>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
          <h2 className="font-display text-[14.5px] font-semibold">Notifications</h2>
        </div>
        <div className="divide-y divide-[var(--border)] px-[18px]">
          <Toggle
            checked={notifyOnFlag}
            onChange={setNotifyOnFlag}
            label="Notify when an item is flagged"
            note="Alert HR the moment a mid-cycle preview run finds something."
          />
          <Toggle
            checked={notifyOnApproval}
            onChange={setNotifyOnApproval}
            label="Notify on approval"
            note="Confirmation when a run is approved and submitted to HMRC."
          />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-[18px] py-3.5">
          {saved && <span className="text-[12.5px] font-semibold text-[var(--good-ink)]">Saved</span>}
          <button
            onClick={save}
            disabled={saving}
            className="ml-auto rounded-lg bg-[var(--accent)] px-4 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>
    </div>
  );
}
