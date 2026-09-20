"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OnboardingTask } from "@/lib/queries";

export function OnboardingChecklist({ initialTasks }: { initialTasks: OnboardingTask[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const outstanding = tasks.filter((t) => !t.done).length;

  async function toggle(id: string) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: t.done ? 0 : 1 } : t)));
    try {
      await fetch("/api/onboarding-tasks/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } catch {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: t.done ? 0 : 1 } : t)));
    }
  }

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
        <h2 className="font-display text-[14.5px] font-semibold">Digital onboarding</h2>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{
            background: outstanding === 0 ? "var(--good-soft)" : "var(--warning-soft)",
            color: outstanding === 0 ? "var(--good-ink)" : "var(--warning-ink)",
          }}
        >
          {outstanding === 0 ? "Complete" : `${outstanding} outstanding`}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-[18px] py-4">
        {tasks.map((t) => (
          <label key={t.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]">
            <input
              type="checkbox"
              checked={!!t.done}
              onChange={() => toggle(t.id)}
              className="h-4 w-4 flex-none accent-[var(--accent)]"
            />
            <span className={`text-[13px] ${t.done ? "text-[var(--ink-muted)] line-through" : "font-medium"}`}>{t.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}
