"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Integration } from "@/lib/queries";

export function IntegrationsGrid({ integrations }: { integrations: Integration[] }) {
  const router = useRouter();
  const [items, setItems] = useState(integrations);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(id: string) {
    setBusyId(id);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: i.status === "connected" ? "not_connected" : "connected" } : i))
    );
    try {
      await fetch("/api/integrations/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const categories = Array.from(new Set(items.map((i) => i.category)));

  return (
    <div className="flex flex-col gap-8">
      {categories.map((category) => (
        <div key={category}>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]">{category}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items
              .filter((i) => i.category === category)
              .map((i) => {
                const connected = i.status === "connected";
                return (
                  <div key={i.id} className="flex flex-col justify-between gap-3.5 rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[18px] shadow-[var(--shadow)]">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-[14.5px] font-semibold">{i.name}</h3>
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold"
                          style={{
                            background: connected ? "var(--good-soft)" : "var(--surface-2)",
                            color: connected ? "var(--good-ink)" : "var(--ink-muted)",
                          }}
                        >
                          {connected ? "Connected" : "Not connected"}
                        </span>
                      </div>
                      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--ink-secondary)]">{i.description}</p>
                      {connected && i.last_synced_at && (
                        <div className="mt-2 text-[11px] text-[var(--ink-muted)]">Last synced {i.last_synced_at}</div>
                      )}
                    </div>
                    <button
                      disabled={busyId === i.id}
                      onClick={() => toggle(i.id)}
                      className={`rounded-lg px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-50 ${
                        connected
                          ? "border border-[var(--border-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                          : "bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
                      }`}
                    >
                      {connected ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
