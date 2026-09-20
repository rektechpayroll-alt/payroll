import type { RunDiffRow } from "./queries";

/**
 * A git-style diff between two consecutive payroll runs — pillar T. Rather than a flat
 * report someone has to compare by eye, each employee is classified against what actually
 * changed since the last run: joined, left, pay moved, a compliance flag appeared or
 * cleared, or nothing changed at all.
 */

const PAY_CHANGE_THRESHOLD = 0.005; // ignore sub-penny rounding noise as "changed"

export type DiffStatus = "new" | "left" | "changed" | "unchanged";
export type FlagChange = "appeared" | "resolved" | "unchanged";

export type DiffLine = RunDiffRow & {
  status: DiffStatus;
  delta: number | null;
  deltaPct: number | null;
  flagChange: FlagChange;
};

export type DiffSummary = {
  starters: number;
  leavers: number;
  payChanged: number;
  payUnchanged: number;
  flagsAppeared: number;
  flagsResolved: number;
  netDelta: number;
};

function classifyRow(row: RunDiffRow): DiffLine {
  const hasCurrent = row.current_net != null;
  const hasPrevious = row.previous_net != null;

  let delta: number | null = null;
  let deltaPct: number | null = null;
  if (hasCurrent && hasPrevious) {
    delta = row.current_net! - row.previous_net!;
    deltaPct = row.previous_net! !== 0 ? (delta / row.previous_net!) * 100 : null;
  }

  const flagChange: FlagChange =
    row.current_severity && !row.previous_severity
      ? "appeared"
      : !row.current_severity && row.previous_severity
        ? "resolved"
        : "unchanged";

  let status: DiffStatus;
  if (!hasPrevious) status = "new";
  else if (!hasCurrent) status = "left";
  else if ((delta != null && Math.abs(delta) > PAY_CHANGE_THRESHOLD) || flagChange !== "unchanged") status = "changed";
  else status = "unchanged";

  return { ...row, status, delta, deltaPct, flagChange };
}

export function buildRunDiff(rows: RunDiffRow[]): { lines: DiffLine[]; summary: DiffSummary } {
  const lines = rows.map(classifyRow);

  const summary: DiffSummary = {
    starters: lines.filter((l) => l.status === "new").length,
    leavers: lines.filter((l) => l.status === "left").length,
    payChanged: lines.filter((l) => l.delta != null && Math.abs(l.delta) > PAY_CHANGE_THRESHOLD).length,
    payUnchanged: lines.filter((l) => l.delta != null && Math.abs(l.delta) <= PAY_CHANGE_THRESHOLD).length,
    flagsAppeared: lines.filter((l) => l.flagChange === "appeared").length,
    flagsResolved: lines.filter((l) => l.flagChange === "resolved").length,
    netDelta: lines.reduce((sum, l) => sum + (l.delta ?? 0), 0),
  };

  return { lines, summary };
}
