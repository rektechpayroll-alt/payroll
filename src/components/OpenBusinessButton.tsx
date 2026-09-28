"use client";

import { useState } from "react";
import { switchBusiness } from "@/components/BusinessSwitcher";

export function OpenBusinessButton({ companyId }: { companyId: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await switchBusiness(companyId);
        } catch {
          setBusy(false);
        }
      }}
      className="rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50"
    >
      {busy ? "Opening…" : "Open"}
    </button>
  );
}
