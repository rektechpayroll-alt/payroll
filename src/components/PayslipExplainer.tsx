"use client";

import { useState } from "react";
import { gbp } from "@/lib/format";
import type { Employee, PayrollLine } from "@/lib/queries";
import { estimateGrossFromNet, nmwCheck, statutoryEligibility } from "@/lib/compliance";

type Message = { from: "user" | "verity"; text: string; breakdown?: { label: string; value: string }[] };

const SUGGESTIONS = [
  "Why did my pay change this month?",
  "How is my net pay calculated?",
  "Am I paid at least minimum wage?",
  "What statutory leave am I entitled to?",
];

function answerFor(question: string, employee: Employee, line: PayrollLine | null): Message {
  const q = question.toLowerCase();

  if (q.includes("chang") || q.includes("differ") || q.includes("why")) {
    if (!line) {
      return { from: "verity", text: "There's no payroll run to compare against yet for you this cycle." };
    }
    if (line.delta_pct != null) {
      const direction = line.delta_pct < 0 ? "down" : "up";
      return {
        from: "verity",
        text: `Your net pay this run is ${direction} ${Math.abs(line.delta_pct)}% versus last period. ${line.reason ?? ""}`,
      };
    }
    if (line.severity) {
      return { from: "verity", text: `${line.tag_label ?? "Something"} was flagged on this run: ${line.reason}` };
    }
    return { from: "verity", text: "Nothing unusual — your pay this run followed the same pattern as last period, and it validated automatically." };
  }

  if (q.includes("wage") || q.includes("minimum") || q.includes("nmw")) {
    if (!line) return { from: "verity", text: "I don't have a current run to check this against yet." };
    const check = nmwCheck(employee, line);
    return {
      from: "verity",
      text: check.pass
        ? `Yes — your estimated effective rate is £${check.rate.toFixed(2)}/hour, above the £${check.floor.toFixed(2)}/hour National Minimum Wage floor.`
        : `This one needs a look — your estimated effective rate is £${check.rate.toFixed(2)}/hour, below the £${check.floor.toFixed(2)}/hour floor. Flag this to HR.`,
    };
  }

  if (q.includes("leave") || q.includes("maternity") || q.includes("paternity") || q.includes("sick") || q.includes("statutory")) {
    const s = statutoryEligibility(employee);
    return {
      from: "verity",
      text: `Sick pay: ${s.ssp.note} Family leave (maternity/paternity/adoption/shared parental): ${s.familyLeave.note}`,
    };
  }

  if (q.includes("calculat") || q.includes("tax") || q.includes("deduct") || q.includes("gross") || q.includes("breakdown")) {
    if (!line) return { from: "verity", text: "There's no current run to break down yet." };
    const gross = estimateGrossFromNet(line.net_pay);
    const tax = gross * 0.15;
    const ni = gross * 0.07;
    const pension = gross * 0.02;
    return {
      from: "verity",
      text: "Here's an illustrative breakdown of how your take-home is estimated (not a real tax calculation):",
      breakdown: [
        { label: "Estimated gross pay", value: gbp(gross) },
        { label: "Income tax (est.)", value: `− ${gbp(tax)}` },
        { label: "National Insurance (est.)", value: `− ${gbp(ni)}` },
        { label: "Pension contribution (est.)", value: `− ${gbp(pension)}` },
        { label: "Net pay", value: gbp(line.net_pay) },
      ],
    };
  }

  return {
    from: "verity",
    text: "I can help with pay variance, how your net pay is calculated, minimum wage checks, and statutory leave eligibility — try one of the suggestions above, or ask in your own words.",
  };
}

export function PayslipExplainer({ employee, line }: { employee: Employee; line: PayrollLine | null }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      from: "verity",
      text: `Hi ${employee.name.split(" ")[0]} — ask me anything about your payslip. I can explain variance, deductions, minimum wage, or your statutory entitlements.`,
    },
  ]);
  const [input, setInput] = useState("");

  function ask(question: string) {
    if (!question.trim()) return;
    const answer = answerFor(question, employee, line);
    setMessages((prev) => [...prev, { from: "user", text: question }, answer]);
    setInput("");
  }

  return (
    <section className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
      <div className="border-b border-[var(--border)] px-[18px] py-[15px] pb-[13px]">
        <h2 className="font-display text-[14.5px] font-semibold">Conversational Payslip Explainer</h2>
        <div className="mt-0.5 text-xs text-[var(--ink-muted)]">
          Plain-language answers about this payslip — no HMRC portal registration needed.
        </div>
      </div>

      <div className="flex flex-col gap-3 px-[18px] py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-[12px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.from === "user"
                  ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                  : "bg-[var(--surface-2)] text-[var(--ink)]"
              }`}
            >
              {m.text}
              {m.breakdown && (
                <div className="mt-2.5 flex flex-col gap-1 border-t border-[var(--border)] pt-2">
                  {m.breakdown.map((row) => (
                    <div key={row.label} className="flex justify-between gap-3 text-[12.5px]">
                      <span className="text-[var(--ink-secondary)]">{row.label}</span>
                      <span className="font-num font-semibold">{row.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-[var(--border)] px-[18px] py-3">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--ink-secondary)] hover:border-[var(--accent)] hover:text-[var(--ink)]"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex items-center gap-2 border-t border-[var(--border)] px-[18px] py-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your payslip…"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[13px] outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          className="flex-none rounded-lg bg-[var(--accent)] px-3.5 py-2 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]"
        >
          Ask
        </button>
      </form>
    </section>
  );
}
