import Link from "next/link";
import { FinaliseButton, HmrcFiling, VatSettingsForm } from "@/components/VatHub";
import { gbp } from "@/lib/format";
import { mtdConfigProblem, mtdConnected } from "@/lib/vat/mtd";
import { calculateVatReturn, getVatReturn, getVatSettings, vatPeriods } from "@/lib/vat/returns";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";
const BOXES: Array<[keyof import("@/lib/vat/calc").VatBoxes, string]> = [
  ["box1", "VAT due on sales"],
  ["box2", "VAT due on acquisitions from the EU (Northern Ireland goods)"],
  ["box3", "Total VAT due"],
  ["box4", "VAT reclaimed on purchases"],
  ["box5", "Net VAT to pay HMRC or reclaim"],
  ["box6", "Total sales excluding VAT"],
  ["box7", "Total purchases excluding VAT"],
  ["box8", "Supplies of goods to the EU (Northern Ireland)"],
  ["box9", "Acquisitions of goods from the EU (Northern Ireland)"],
];
const STATUS: Record<string, { label: string; bg: string; ink: string }> = {
  open: { label: "In progress", bg: "var(--surface-2)", ink: "var(--ink-muted)" },
  due: { label: "Ready to file", bg: "var(--warning-soft)", ink: "var(--warning-ink)" },
  finalised: { label: "Finalised", bg: "var(--accent-soft)", ink: "var(--accent-strong)" },
  submitted: { label: "Filed with HMRC", bg: "var(--good-soft)", ink: "var(--good-ink)" },
};

export default async function VatPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const settings = await getVatSettings();
  const periods = settings.vat_registered ? await vatPeriods() : [];
  const selected = periods.find((p) => p.start === sp.start) ?? periods.find((p) => p.status === "due") ?? periods[0];
  const calc = selected ? await calculateVatReturn(selected.start, selected.end) : null;
  const saved = selected?.returnId ? await getVatReturn(selected.returnId) : null;
  const boxes = selected?.boxes ?? calc?.boxes ?? null;
  const [connected, problem] = [settings.vat_registered ? await mtdConnected() : false, mtdConfigProblem()];

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">VAT</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          VAT returns worked out from your invoices, bills, expenses and bank lines — filed to HMRC under Making Tax Digital
        </div>
      </div>
      {typeof sp.error === "string" && <div className="mb-4 rounded-[10px] bg-[var(--critical-soft)] px-4 py-3 text-[12.5px] text-[var(--critical-ink)]">{sp.error}</div>}
      {sp.connected && <div className="mb-4 rounded-[10px] bg-[var(--good-soft)] px-4 py-3 text-[12.5px] text-[var(--good-ink)]">Connected to HMRC.</div>}

      <section className={`${card} mb-4 px-[18px] py-4`}>
        <h2 className="mb-3 font-display text-[14.5px] font-semibold">VAT settings</h2>
        <VatSettingsForm settings={settings} />
      </section>

      {settings.vat_registered && selected && calc && boxes && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <section className={`${card} self-start`}>
            {periods.map((p) => {
              const st = STATUS[p.status];
              return (
                <Link
                  key={p.start}
                  href={`/dashboard/vat?start=${p.start}`}
                  className={`flex flex-col gap-1 border-b border-[var(--border)] px-4 py-2.5 text-[12.5px] last:border-b-0 ${p.start === selected.start ? "bg-[var(--surface-2)]" : ""}`}
                >
                  <span className="font-num font-semibold">
                    {p.start} – {p.end}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: st.bg, color: st.ink }}>
                      {st.label}
                    </span>
                    <span className="text-[var(--ink-muted)]">due {p.dueDate}</span>
                  </span>
                </Link>
              );
            })}
          </section>

          <div className="flex flex-col gap-4">
            <section className={card}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-[13px]">
                <div>
                  <h2 className="font-display text-[14.5px] font-semibold">
                    VAT return {selected.start} – {selected.end}
                  </h2>
                  <div className="text-xs text-[var(--ink-muted)]">
                    {settings.vat_scheme === "cash" ? "Cash accounting — counted when paid" : "Standard accounting — counted by invoice date"}
                    {saved ? ` · finalised figures${saved.hmrc_receipt ? ` · HMRC receipt ${saved.hmrc_receipt}` : ""}` : " · live figures"}
                  </div>
                </div>
                {selected.status === "due" && <FinaliseButton start={selected.start} end={selected.end} />}
              </div>
              <table className="w-full text-[13px]">
                <tbody>
                  {BOXES.map(([k, label], i) => (
                    <tr key={k} className={k === "box5" ? "font-semibold" : ""}>
                      <td className="w-[60px] px-[18px] py-1.5 text-[var(--ink-muted)]">Box {i + 1}</td>
                      <td className="py-1.5">{label}</td>
                      <td className="font-num px-[18px] py-1.5 text-right">{gbp((boxes[k] as number) / 100)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td />
                    <td colSpan={2} className="px-[18px] pb-3 pt-1 text-[12px]" style={{ color: boxes.payable ? "var(--warning-ink)" : "var(--good-ink)" }}>
                      {boxes.payable ? `You owe HMRC ${gbp(boxes.box5 / 100)}` : `HMRC owes you ${gbp(boxes.box5 / 100)}`}
                    </td>
                  </tr>
                </tbody>
              </table>
              {selected.status === "finalised" && selected.returnId && (
                <div className="border-t border-[var(--border)] px-[18px] py-4">
                  <HmrcFiling returnId={selected.returnId} start={selected.start} end={selected.end} connected={connected} configProblem={problem} />
                </div>
              )}
            </section>

            <section className={card}>
              <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
                <h2 className="font-display text-[14.5px] font-semibold">What&rsquo;s in this return</h2>
              </div>
              {calc.sources.length === 0 ? (
                <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">Nothing in this period yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[12.5px]">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
                        <th className="px-[18px] py-2 font-semibold">Date</th>
                        <th className="px-[18px] py-2 font-semibold">Item</th>
                        <th className="px-[18px] py-2 text-right font-semibold">Net</th>
                        <th className="px-[18px] py-2 text-right font-semibold">VAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calc.sources.map((s, i) => (
                        <tr key={i} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="font-num px-[18px] py-1.5">{s.date}</td>
                          <td className="px-[18px] py-1.5">
                            <span className="text-[var(--ink-muted)]">{s.kind === "sale" ? "Sale" : "Purchase"} · {s.type}:</span> {s.reference}
                          </td>
                          <td className="font-num px-[18px] py-1.5 text-right">{gbp(s.net / 100)}</td>
                          <td className="font-num px-[18px] py-1.5 text-right">{gbp(s.vat / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
