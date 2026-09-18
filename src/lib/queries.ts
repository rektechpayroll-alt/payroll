import { randomUUID } from "node:crypto";
import { getPool, ready } from "./db";

const COMPANY_ID = "harrow-vale";

export type PayrollLine = {
  id: string;
  employee_id: string | null;
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

export type Employee = {
  id: string;
  company_id: string;
  name: string;
  role: string;
  email: string;
  employment_type: string;
  start_date: string;
  tax_code: string;
  ni_number: string;
  weekly_hours: number;
  sort_order: number;
};

export type Integration = {
  id: string;
  company_id: string;
  name: string;
  category: string;
  description: string;
  status: "connected" | "not_connected";
  last_synced_at: string | null;
  sort_order: number;
};

export type Company = {
  id: string;
  name: string;
  employee_count: number;
  pay_schedule: string;
  notify_on_flag: boolean;
  notify_on_approval: boolean;
  approval_mode: "manual" | "hybrid";
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

export async function getCompany(): Promise<Company> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM companies WHERE id = $1", [COMPANY_ID]);
  return rows[0] as Company;
}

export async function updateCompanySettings(input: {
  pay_schedule: string;
  notify_on_flag: boolean;
  notify_on_approval: boolean;
  approval_mode: "manual" | "hybrid";
}): Promise<Company> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE companies
     SET pay_schedule = $1, notify_on_flag = $2, notify_on_approval = $3, approval_mode = $4
     WHERE id = $5
     RETURNING *`,
    [input.pay_schedule, input.notify_on_flag, input.notify_on_approval, input.approval_mode, COMPANY_ID]
  );
  return rows[0] as Company;
}

export async function getCurrentRun(): Promise<PayrollRun> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM payroll_runs WHERE company_id = $1 ORDER BY created_at DESC LIMIT 1",
    [COMPANY_ID]
  );
  return rows[0] as PayrollRun;
}

export async function getLinesForRun(runId: string): Promise<PayrollLine[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM payroll_lines WHERE run_id = $1 ORDER BY sort_order ASC",
    [runId]
  );
  return rows as PayrollLine[];
}

export async function getSourceCounts(runId: string) {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT source, COUNT(*) as n FROM payroll_lines
     WHERE run_id = $1 AND severity IS NOT NULL AND resolved = 0
     GROUP BY source`,
    [runId]
  );
  return rows.map((r) => ({ source: r.source, n: Number(r.n) })) as { source: string; n: number }[];
}

export async function resolveLine(lineId: string): Promise<PayrollLine> {
  await ready();
  const pool = getPool();
  await pool.query("UPDATE payroll_lines SET resolved = 1 WHERE id = $1", [lineId]);
  const { rows } = await pool.query("SELECT * FROM payroll_lines WHERE id = $1", [lineId]);
  return rows[0] as PayrollLine;
}

export async function approveRun(runId: string) {
  await ready();
  const pool = getPool();
  const lines = await getLinesForRun(runId);
  const blocking = lines.filter((l) => l.severity === "critical" && !l.resolved);
  const status = blocking.length > 0 ? "approved_partial" : "approved";
  await pool.query("UPDATE payroll_runs SET status = $1 WHERE id = $2", [status, runId]);

  const included = lines.filter((l) => !(l.severity === "critical" && !l.resolved));
  const now = "Just now";
  const message =
    blocking.length > 0
      ? `Approved ${included.length} of ${lines.length} — Jack Whitmore excluded`
      : `Approved by Aniket Sharma — all ${lines.length} employees`;
  const detail =
    blocking.length > 0
      ? "2FA verified · will join the next run once bank details are confirmed"
      : "2FA verified · BACS submission and HMRC RTI filing triggered";

  await pool.query(
    `INSERT INTO audit_log (id, company_id, kind, message, detail, occurred_at, sort_order)
     VALUES ($1, $2, 'approval', $3, $4, $5, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM audit_log WHERE company_id = $6))`,
    [randomUUID(), COMPANY_ID, message, detail, now, COMPANY_ID]
  );

  return { status, blockingCount: blocking.length, includedCount: included.length, total: lines.length };
}

export async function getAuditLog(limit = 6) {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM audit_log WHERE company_id = $1 ORDER BY sort_order DESC LIMIT $2",
    [COMPANY_ID, limit]
  );
  return rows as {
    id: string;
    kind: string;
    message: string;
    detail: string;
    occurred_at: string;
  }[];
}

export async function getCostTrend() {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM cost_trend WHERE company_id = $1 ORDER BY sort_order ASC",
    [COMPANY_ID]
  );
  return rows as {
    month_label: string;
    cost_to_company: number;
    deals_index: number;
    headcount_index: number;
  }[];
}

export async function getProfitabilityStats() {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM profitability_stats WHERE company_id = $1", [COMPANY_ID]);
  return rows[0] as {
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

export async function getRecommendations() {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT body FROM recommendations WHERE company_id = $1 ORDER BY sort_order ASC",
    [COMPANY_ID]
  );
  return rows as { body: string }[];
}

export async function getEmployees(): Promise<Employee[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM employees WHERE company_id = $1 ORDER BY sort_order ASC",
    [COMPANY_ID]
  );
  return rows as Employee[];
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM employees WHERE id = $1 AND company_id = $2", [id, COMPANY_ID]);
  return (rows[0] as Employee) ?? null;
}

/** The employee's line on the current (most recent) payroll run, if one exists. */
export async function getCurrentLineForEmployee(employeeId: string): Promise<PayrollLine | null> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT pl.* FROM payroll_lines pl
     JOIN payroll_runs pr ON pr.id = pl.run_id
     WHERE pl.employee_id = $1 AND pr.company_id = $2
     ORDER BY pr.created_at DESC LIMIT 1`,
    [employeeId, COMPANY_ID]
  );
  return (rows[0] as PayrollLine) ?? null;
}

export async function getIntegrations(): Promise<Integration[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM integrations WHERE company_id = $1 ORDER BY sort_order ASC",
    [COMPANY_ID]
  );
  return rows as Integration[];
}

export async function toggleIntegration(id: string): Promise<Integration> {
  await ready();
  const pool = getPool();
  const nowLabel = "Just now";
  const { rows } = await pool.query(
    `UPDATE integrations
     SET status = CASE WHEN status = 'connected' THEN 'not_connected' ELSE 'connected' END,
         last_synced_at = CASE WHEN status = 'connected' THEN last_synced_at ELSE $2 END
     WHERE id = $1 AND company_id = $3
     RETURNING *`,
    [id, nowLabel, COMPANY_ID]
  );
  return rows[0] as Integration;
}
