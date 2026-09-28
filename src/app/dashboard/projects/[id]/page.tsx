import Link from "next/link";
import { notFound } from "next/navigation";
import { CostForm, EditProject, InvoiceProject, RemoveButton, StatusSelect, TimeForm } from "@/components/ProjectsHub";
import { StatRow, StatTile } from "@/components/StatTile";
import { getPool } from "@/lib/db";
import { gbp } from "@/lib/format";
import { taxYearFor } from "@/lib/payroll/rates";
import { employeeCostRate } from "@/lib/projects/costing";
import { getProject, ProjectError } from "@/lib/projects/service";
import { currentCompanyId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";
const niceDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getProject(id).catch((e) => {
    if (e instanceof ProjectError) notFound();
    throw e;
  });
  const { project: p, entries, costs, invoices, financials: f } = detail;
  const today = new Date().toISOString().slice(0, 10);
  const { rows: staff } = await getPool().query("SELECT * FROM employees WHERE company_id = $1 AND (leaving_date IS NULL OR leaving_date = '') ORDER BY name", [await currentCompanyId()]);
  const employees = staff.map((e) => ({ id: e.id, name: e.name, costRate: employeeCostRate(e, taxYearFor(today)) }));

  return (
    <div>
      <div className="mb-2 text-[12.5px]">
        <Link href="/dashboard/projects" className="font-semibold text-[var(--accent-strong)]">
          ← Projects
        </Link>
      </div>
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">{p.name}</h1>
          <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
            {p.client_name} · {p.billing === "hourly" ? `£${p.hourly_rate.toFixed(2)} an hour` : p.billing === "fixed" ? `fixed price ${gbp(p.fixed_price ?? 0)}` : "internal"} · started {niceDate(p.start_date)}
            {p.due_date ? ` · due ${niceDate(p.due_date)}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusSelect id={p.id} status={p.status} />
          <EditProject
            values={{
              id: p.id,
              name: p.name,
              clientName: p.client_name,
              billing: p.billing,
              hourlyRate: String(p.hourly_rate ?? ""),
              fixedPrice: p.fixed_price ? String(p.fixed_price) : "",
              budget: String(p.budget ?? ""),
              startDate: p.start_date,
              dueDate: p.due_date ?? "",
            }}
          />
        </div>
      </div>

      <StatRow>
        <StatTile
          label={p.billing === "fixed" ? "Price" : "Expected revenue"}
          value={gbp(f.expectedRevenue)}
          meta={<span>invoiced {gbp(f.invoiced)}{p.billing === "hourly" ? ` · unbilled ${gbp(f.unbilled)}` : p.billing === "fixed" ? ` · ${gbp(f.leftToInvoice ?? 0)} left to invoice` : ""}</span>}
        />
        <StatTile
          label="Costs"
          value={gbp(f.totalCost)}
          meta={<span>{f.hours} hours costing {gbp(f.timeCost)} · other costs {gbp(f.otherCosts)}{f.budgetUsedPct !== null ? ` · ${f.budgetUsedPct}% of ${gbp(p.budget)} budget` : ""}</span>}
          pill={f.budgetUsedPct !== null && f.budgetUsedPct > 100 ? { tone: "warn", icon: <span>⚠</span>, text: "Over budget" } : undefined}
        />
        <StatTile
          label="Expected profit"
          value={gbp(f.expectedProfit)}
          meta={<span>{f.margin === null ? "no revenue" : `${f.margin}% margin`} · profit so far {gbp(f.profit)}</span>}
          pill={f.margin !== null ? (f.expectedProfit >= 0 ? { tone: "good", icon: <span>✓</span>, text: "Profitable" } : { tone: "warn", icon: <span>⚠</span>, text: "Losing money" }) : undefined}
        />
      </StatRow>

      <section className={`${card} mb-4`}>
        <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
          <h2 className="font-display text-[14.5px] font-semibold">Invoice the client</h2>
        </div>
        <div className="px-[18px] py-3">
          <InvoiceProject projectId={p.id} billing={p.billing} unbilled={f.unbilled} leftToInvoice={f.leftToInvoice} />
        </div>
        {invoices.map((i) => (
          <div key={i.id} className="flex justify-between border-t border-[var(--border)] px-[18px] py-2 text-[12.5px]">
            <span>
              <strong>{i.invoice_number}</strong> · {niceDate(i.issue_date)} · <span className="capitalize">{i.status}</span>
            </span>
            <span className="font-num">{gbp(i.subtotal)} + VAT</span>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Time</h2>
            <div className="text-xs text-[var(--ink-muted)]">
              {f.hours} hours · {f.billableHours} billable
            </div>
          </div>
          <div className="border-b border-[var(--border)] px-[18px] py-3">
            <TimeForm projectId={p.id} employees={employees} billable={p.billing === "hourly"} />
          </div>
          {entries.length === 0 ? (
            <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">No time logged yet.</div>
          ) : (
            entries.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-2 text-[12.5px] last:border-b-0">
                <span className="min-w-0">
                  <span className="font-num text-[var(--ink-muted)]">{niceDate(t.entry_date)}</span> · <strong>{t.employee_name}</strong> {t.hours}h{t.note ? ` — ${t.note}` : ""}
                  <span className="block text-[11px] text-[var(--ink-muted)]">
                    cost £{t.cost_rate.toFixed(2)}/h{t.billable ? ` · bills at £${t.bill_rate.toFixed(2)}/h` : " · not billable"}
                    {t.invoice_number ? ` · on ${t.invoice_number}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="font-num">{gbp(t.hours * t.cost_rate)}</span>
                  {!t.invoice_number && <RemoveButton url="/api/projects/time/delete" id={t.id} />}
                </span>
              </div>
            ))
          )}
        </section>

        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Costs</h2>
            <div className="text-xs text-[var(--ink-muted)]">Excluding VAT</div>
          </div>
          <div className="border-b border-[var(--border)] px-[18px] py-3">
            <CostForm projectId={p.id} billable={p.billing === "hourly"} />
          </div>
          {costs.length === 0 ? (
            <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">No costs yet.</div>
          ) : (
            costs.map((c) => (
              <div key={`${c.source}-${c.id}`} className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-2 text-[12.5px] last:border-b-0">
                <span className="min-w-0">
                  <span className="font-num text-[var(--ink-muted)]">{niceDate(c.date)}</span> · {c.description}
                  <span className="block text-[11px] text-[var(--ink-muted)]">
                    {c.source === "cost" ? (c.billable ? `recharged${c.markup_pct ? ` +${c.markup_pct}%` : ""}` : "not recharged") : c.source === "bill" ? "from Purchasing" : "from Expenses"}
                    {c.invoice_number ? ` · on ${c.invoice_number}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="font-num">{gbp(c.amount)}</span>
                  {c.source === "cost" && !c.invoice_number && <RemoveButton url="/api/projects/costs/delete" id={c.id} />}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
