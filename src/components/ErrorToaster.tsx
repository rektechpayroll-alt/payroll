"use client";

import { useEffect, useState } from "react";

/** Shows errors announced by postOrReport(), bottom-centre, until dismissed or replaced. */
export function ErrorToaster() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const onError = (e: Event) => setMessage((e as CustomEvent<string>).detail);
    window.addEventListener("verity:error", onError);
    return () => window.removeEventListener("verity:error", onError);
  }, []);
  if (!message) return null;
  return (
    <div role="alert" className="fixed bottom-5 left-1/2 z-50 flex max-w-[560px] -translate-x-1/2 items-start gap-3 rounded-[10px] bg-[var(--critical-soft)] px-4 py-3 text-[13px] text-[var(--critical-ink)] shadow-[var(--shadow)]">
      <span>{message}</span>
      <button onClick={() => setMessage(null)} className="font-semibold" aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}
