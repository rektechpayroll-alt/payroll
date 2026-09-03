import { getDb } from "./db";

const COMPANY_ID = "harrow-vale";

export type PayrollLine = {
  id: string;
  employee_name: string;
  role: string;
  net_pay: number;
  severity: "critical" | "serious" | "warning" | null;
  source: string | null;
  tag_label: string | null;
  reason: string | null;
  delta_pct: number | null;
  resolved: number;
};

export type PayrollRun = {
  id: string;
  company_id: string;
  period_label: string;
  pay_period: string;
  payday: string;
  bacs_cutoff_label: string;
  status: string;
  gross_pay: number;
  employer_ni: number;
  employer_pension: number;
  net_pay: number;
  connected_balance: number;
  mid_month_note: string | null;
};

export function getCompany() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM companies WHERE id = ?")
    .get(COMPANY_ID) as { id: string; name: string; employee_count: number; pay_schedule: string };
}

export function getCurrentRun(): PayrollRun {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM payroll_runs WHERE company_id = ? ORDER BY rowid DESC LIMIT 1"
    )
    .get(COMPANY_ID) as PayrollRun;
}

export function getLinesForRun(runId: string): PayrollLine[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM payroll_lines WHERE run_id = ? ORDER BY sort_order ASC")
    .all(runId) as PayrollLine[];
  // node:sqlite returns null-prototype row objects, which React Server
  // Components refuse to serialize across the client-component boundary.
  return rows.map((r) => ({ ...r }));
}

export function getSourceCounts(runId: string) {
  const db = getDb();
  return db
    .prepare(
      `SELECT source, COUNT(*) as n FROM payroll_lines
       WHERE run_id = ? AND severity IS NOT NULL AND resolved = 0
       GROUP BY source`
    )
    .all(runId) as { source: string; n: number }[];
}

export function resolveLine(lineId: string) {
  const db = getDb();
  db.prepare("UPDATE payroll_lines SET resolved = 1 WHERE id = ?").run(lineId);
  return db.prepare("SELECT * FROM payroll_lines WHERE id = ?").get(lineId) as PayrollLine;
}

export function approveRun(runId: string) {
  const db = getDb();
  const lines = getLinesForRun(runId);
  const blocking = lines.filter((l) => l.severity === "critical" && !l.resolved);
  const status = blocking.length > 0 ? "approved_partial" : "approved";
  db.prepare("UPDATE payroll_runs SET status = ? WHERE id = ?").run(status, runId);

  const included = lines.filter((l) => !(l.severity === "critical" && !l.resolved));
  const now = "Just now";
  const db2 = getDb();
  const insertAudit = db2.prepare(
    `INSERT INTO audit_log (id, company_id, kind, message, detail, occurred_at, sort_order)
     VALUES (?, ?, 'approval', ?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM audit_log WHERE company_id = ?))`
  );
  const message =
    blocking.length > 0
      ? `Approved ${included.length} of ${lines.length} — Jack Whitmore excluded`
      : `Approved by Aniket Sharma — all ${lines.length} employees`;
  const detail =
    blocking.length > 0
      ? "2FA verified · will join the next run once bank details are confirmed"
      : "2FA verified · BACS submission and HMRC RTI filing triggered";
  insertAudit.run(crypto.randomUUID(), COMPANY_ID, message, detail, now, COMPANY_ID);

  return { status, blockingCount: blocking.length, includedCount: included.length, total: lines.length };
}

export function getAuditLog(limit = 6) {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM audit_log WHERE company_id = ? ORDER BY sort_order DESC LIMIT ?"
    )
    .all(COMPANY_ID, limit) as {
    id: string;
    kind: string;
    message: string;
    detail: string;
    occurred_at: string;
  }[];
}

export function getCostTrend() {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM cost_trend WHERE company_id = ? ORDER BY sort_order ASC"
    )
    .all(COMPANY_ID) as {
    month_label: string;
    cost_to_company: number;
    deals_index: number;
    headcount_index: number;
  }[];
}

export function getProfitabilityStats() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM profitability_stats WHERE company_id = ?")
    .get(COMPANY_ID) as {
    bonus_budget: number;
    bonus_budget_note: string;
    optimum_role: string;
    optimum_salary_low: number;
    optimum_salary_high: number;
    optimum_salary_current: number;
    staffing_note: string;
    staffing_fte_delta: number;
    staffing_flag: string;
  };
}

export function getRecommendations() {
  const db = getDb();
  return db
    .prepare(
      "SELECT body FROM recommendations WHERE company_id = ? ORDER BY sort_order ASC"
    )
    .all(COMPANY_ID) as { body: string }[];
}
