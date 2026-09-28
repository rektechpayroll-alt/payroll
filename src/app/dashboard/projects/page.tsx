import Link from "next/link";
import { ProjectForm } from "@/components/ProjectsHub";
import { StatRow, StatTile } from "@/components/StatTile";
import { gbp } from "@/lib/format";
import { listProjects } from "@/lib/projects/service";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";
const cols = "grid grid-cols-[1.8fr_0.9fr_0.8fr_1fr_1fr_1fr_1fr] items-center gap-2";
const BILLING = { hourly: "Hourly", fixed: "Fixed price", non_billable: "Internal" } as const;
const STATUS = { active: "Active", on_hold: "On hold", completed: "Completed" } as const;

export default async function ProjectsPage() {
  const projects = await listProjects();
  const active = projects.filter((p) => p.status !== "completed");
  const sum = (pick: (p: (typeof projects)[number]) => number) => Math.round(projects.reduce((s, p) => s + pick(p), 0) * 100) / 100;
  const overBudget = active.filter((p) => (p.financials.budgetUsedPct ?? 0) > 100);

  return (
    <div>
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Projects</h1>
          <div className="mt-1 max-w-[720px] text-[13px] text-[var(--ink-secondary)]">
            Time and costs against each job. Every hour is costed at what that person really costs you (pay, employer&rsquo;s NI and pension), bills and expense claims
            can be charged to a project, and unbilled work turns into an invoice in one click.
          </div>
        </div>
      </div>

      <StatRow>
        <StatTile label="Unbilled work" value={gbp(sum((p) => p.financials.unbilled))} meta={<span>time and recharges not yet invoiced</span>} />
        <StatTile label="Profit to date" value={gbp(sum((p) => p.financials.profit))} meta={<span>invoiced {gbp(sum((p) => p.financials.invoiced))} less costs {gbp(sum((p) => p.financials.totalCost))}</span>} />
        <StatTile
          label="Over budget"
          value={String(overBudget.length)}
          meta={<span>{overBudget.length ? overBudget.map((p) => p.name).join(", ") : "every active project is within its cost budget"}</span>}
          pill={overBudget.length ? { tone: "warn", icon: <span>⚠</span>, text: "Check costs" } : undefined}
        />
      </StatRow>

      <div className="mb-4">
        <ProjectForm />
      </div>

      <section className={`${card} overflow-x-auto`}>
        <div className={`${cols} min-w-[860px] bg-[var(--surface-2)] px-[18px] py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-muted)]`}>
          <span>Project</span>
          <span>Billing</span>
          <span className="text-right">Hours</span>
          <span className="text-right">Costs</span>
          <span className="text-right">Invoiced</span>
          <span className="text-right">Unbilled</span>
          <span className="text-right">Margin</span>
        </div>
        {projects.length === 0 ? (
          <div className="px-[18px] py-5 text-[13px] text-[var(--ink-muted)]">No projects yet.</div>
        ) : (
          projects.map((p) => {
            const f = p.financials;
            return (
              <Link key={p.id} href={`/dashboard/projects/${p.id}`} className={`${cols} min-w-[860px] border-t border-[var(--border)] px-[18px] py-2.5 text-[12.5px] hover:bg-[var(--surface-2)]`}>
                <span>
                  <strong>{p.name}</strong> <span className="text-[var(--ink-muted)]">· {p.client_name}</span>
                  <span className="block text-[11px] text-[var(--ink-muted)]">
                    {STATUS[p.status]}
                    {f.budgetUsedPct !== null ? ` · ${f.budgetUsedPct}% of cost budget` : ""}
                  </span>
                  {f.budgetUsedPct !== null && (
                    <span className="mt-1 block h-1.5 max-w-[220px] rounded-full bg-[var(--surface-2)]">
                      <span className="block h-1.5 rounded-full" style={{ width: `${Math.min(100, f.budgetUsedPct)}%`, background: f.budgetUsedPct > 100 ? "var(--critical-ink)" : "var(--accent)" }} />
                    </span>
                  )}
                </span>
                <span>{BILLING[p.billing]}</span>
                <span className="font-num text-right">{f.hours}</span>
                <span className="font-num text-right">{gbp(f.totalCost)}</span>
                <span className="font-num text-right">{gbp(f.invoiced)}</span>
                <span className="font-num text-right">{f.unbilled ? gbp(f.unbilled) : "—"}</span>
                <span className="font-num text-right font-semibold" style={{ color: f.margin === null ? undefined : f.margin < 0 ? "var(--critical-ink)" : "var(--good-ink)" }}>
                  {f.margin === null ? "—" : `${f.margin}%`}
                </span>
              </Link>
            );
          })
        )}
      </section>
    </div>
  );
}
