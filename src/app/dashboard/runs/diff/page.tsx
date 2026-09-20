import { getCompany, getCurrentRun, getPreviousRun, getRunDiff } from "@/lib/queries";
import { buildRunDiff } from "@/lib/rundiff";
import { RunDiffView } from "@/components/RunDiffView";

export const dynamic = "force-dynamic";

export default async function RunDiffPage() {
  const company = await getCompany();
  const currentRun = await getCurrentRun();
  const previousRun = currentRun ? await getPreviousRun(currentRun.id) : null;

  const diff =
    currentRun && previousRun ? buildRunDiff(await getRunDiff(currentRun.id, previousRun.id)) : null;

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Run diff</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} · a git-style diff between consecutive payroll runs — exactly what changed per employee, and why,
          instead of a flat report someone has to compare by eye.
        </div>
      </div>

      {!currentRun || !previousRun || !diff ? (
        <div className="rounded-[14px] border border-[var(--border)] bg-[var(--surface)] p-[18px] text-[13.5px] text-[var(--ink-secondary)] shadow-[var(--shadow)]">
          Not enough payroll history yet — a diff needs at least two runs to compare.
        </div>
      ) : (
        <RunDiffView
          lines={diff.lines}
          summary={diff.summary}
          currentPeriodLabel={currentRun.period_label}
          previousPeriodLabel={previousRun.period_label}
        />
      )}
    </div>
  );
}
