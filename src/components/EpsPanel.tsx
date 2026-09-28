"use client";

import { useState } from "react";
import { RtiSubmitForm } from "@/components/RtiSubmitForm";

const MONTHS = ["Apr–May", "May–Jun", "Jun–Jul", "Jul–Aug", "Aug–Sep", "Sep–Oct", "Oct–Nov", "Nov–Dec", "Dec–Jan", "Jan–Feb", "Feb–Mar", "Mar–Apr"];

export function EpsPanel({ taxYear, defaultMonth, blocked }: { taxYear: string; defaultMonth: number; blocked: string | null }) {
  const [taxMonth, setTaxMonth] = useState(defaultMonth);
  const [noPayment, setNoPayment] = useState(false);
  const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-3 py-2 text-[13px] text-[var(--ink)]";
  const query = `taxYear=${taxYear}&taxMonth=${taxMonth}${noPayment ? "&noPayment=1" : ""}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]">
          Tax month ({taxYear})
          <select className={input} value={taxMonth} onChange={(e) => setTaxMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                Month {i + 1} · 6 {m.split("–")[0]} – 5 {m.split("–")[1]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-[12.5px]">
          <input type="checkbox" checked={noPayment} onChange={(e) => setNoPayment(e.target.checked)} />
          Nobody was paid this month
        </label>
        {!blocked && (
          <a href={`/api/rti/eps/xml?${query}`} className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[12.5px] font-semibold hover:bg-[var(--surface-2)]">
            Download EPS XML
          </a>
        )}
      </div>
      <RtiSubmitForm endpoint="/api/rti/eps/submit" payload={{ taxYear, taxMonth, noPayment }} label="Submit EPS to HMRC" disabled={blocked} />
    </div>
  );
}
