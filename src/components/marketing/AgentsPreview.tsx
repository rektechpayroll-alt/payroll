"use client";

import Link from "next/link";
import { useState } from "react";
import { AGENTS } from "@/lib/agents";

export function AgentsPreview() {
  const [activeId, setActiveId] = useState(AGENTS[0].id);
  const active = AGENTS.find((a) => a.id === activeId) ?? AGENTS[0];

  return (
    <div className="mkt-glow rounded-3xl bg-white/[0.03] p-2 sm:p-3">
      <div className="grid grid-cols-1 overflow-hidden rounded-2xl sm:grid-cols-[240px_1fr]">
        <div className="flex flex-row gap-1 overflow-x-auto border-b border-white/10 p-2 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3">
          {AGENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveId(a.id)}
              className={`flex-none rounded-xl px-3.5 py-3 text-left text-[13.5px] font-semibold transition-colors sm:flex-auto ${
                a.id === activeId ? "bg-white/10 text-white" : "text-white/55 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              {a.name}
            </button>
          ))}
        </div>
        <div className="p-6 sm:p-8">
          <h3 className="text-[19px] font-bold text-white">{active.name}</h3>
          <p className="mt-2.5 max-w-[520px] text-[14.5px] leading-relaxed text-white/70">{active.description}</p>
          <ul className="mt-5 flex flex-col gap-2.5">
            {active.bullets.map((b) => (
              <li key={b} className="flex gap-2.5 text-[13.5px] leading-relaxed text-white/65">
                <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-4 w-4 flex-none text-[#4ade80]">
                  <path d="M5 12.5L10 17L19 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/agents"
            className="mkt-pill mt-6 inline-flex bg-white px-4 py-2.5 text-[13px] font-semibold text-black hover:bg-white/90"
          >
            Try it in the live demo
          </Link>
        </div>
      </div>
    </div>
  );
}
