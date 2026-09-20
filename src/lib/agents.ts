export type AgentDef = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  bullets: string[];
};

// The Verity equivalent of Sage's "Copilot" agent suite — task-specific,
// deterministic agents that act on real data in this demo's Postgres
// database rather than a general-purpose chat assistant. Each agent below
// is a real, working feature on /dashboard/agents, not marketing copy only.
export const AGENTS: AgentDef[] = [
  {
    id: "compliance",
    name: "Compliance Agent",
    tagline: "Scans every employee for NMW, statutory-leave and IR35 exposure before you run payroll.",
    description:
      "Runs the same checks HMRC would care about — National Minimum Wage banding, SSP/SMP/SPP/SAP/ShPP eligibility, IR35 status — across the whole workforce in one pass, and lists exactly which employees need a look, and why.",
    bullets: [
      "Whole-workforce NMW sweep against the current pay run",
      "Statutory leave eligibility (26-week continuous employment rule)",
      "One list of exceptions, not 15 individual employee pages to check by hand",
    ],
  },
  {
    id: "reconciliation",
    name: "Reconciliation Agent",
    tagline: "Flags variance across the current run and explains which rule it might be breaking.",
    description:
      "Re-runs the anomaly detector across every line in the active payroll run and groups what it finds by category — bank & payments, compliance, tax & statutory, commission & variable pay — so a reviewer sees the shape of the problem, not just a flat list.",
    bullets: [
      "Every flagged line grouped by category, not a single undifferentiated list",
      "Reuses the same variance engine that powers the approval dashboard",
      "One-click jump from a flagged item to the employee record",
    ],
  },
  {
    id: "close",
    name: "Close Agent",
    tagline: "Tracks the month-end checklist so nothing is signed off half-done.",
    description:
      "A standing checklist for the tasks that have to happen before a run is authorised — RTI submitted, NEST contributions confirmed, reports exported, exceptions cleared — with real completion state stored per company, not a paper list someone re-creates every cycle.",
    bullets: [
      "Persistent checklist, not a spreadsheet redone every month",
      "Shows exactly what's outstanding before payroll can be signed off",
      "Shared visibility for HR and the accountant on the same list",
    ],
  },
];
