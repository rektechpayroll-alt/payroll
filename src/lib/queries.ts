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

/** The most recently created run for this company that predates `beforeRunId` — the "previous" run for the diff view. */
export async function getPreviousRun(beforeRunId: string): Promise<PayrollRun | null> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT pr.* FROM payroll_runs pr
     WHERE pr.company_id = $1
       AND pr.created_at < (SELECT created_at FROM payroll_runs WHERE id = $2)
     ORDER BY pr.created_at DESC LIMIT 1`,
    [COMPANY_ID, beforeRunId]
  );
  return (rows[0] as PayrollRun) ?? null;
}

export type RunDiffRow = {
  employee_id: string | null;
  employee_name: string;
  role: string;
  current_net: number | null;
  previous_net: number | null;
  current_severity: "critical" | "serious" | "warning" | null;
  current_tag: string | null;
  current_reason: string | null;
  previous_severity: "critical" | "serious" | "warning" | null;
  previous_tag: string | null;
};

/**
 * Employee-by-employee comparison between two runs — a FULL OUTER JOIN on employee_id so
 * starters (no previous line) and leavers (no current line) both come through, alongside
 * everyone whose pay or flag status changed (or didn't). Classification into
 * new/left/changed/unchanged happens in lib/rundiff.ts, kept separate from this raw fetch.
 */
export async function getRunDiff(currentRunId: string, previousRunId: string): Promise<RunDiffRow[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    `WITH cur AS (
       SELECT * FROM payroll_lines WHERE run_id = $1
     ), prev AS (
       SELECT * FROM payroll_lines WHERE run_id = $2
     )
     SELECT
       COALESCE(cur.employee_id, prev.employee_id) AS employee_id,
       COALESCE(cur.employee_name, prev.employee_name) AS employee_name,
       COALESCE(cur.role, prev.role) AS role,
       cur.net_pay AS current_net,
       prev.net_pay AS previous_net,
       cur.severity AS current_severity,
       cur.tag_label AS current_tag,
       cur.reason AS current_reason,
       prev.severity AS previous_severity,
       prev.tag_label AS previous_tag
     FROM cur
     FULL OUTER JOIN prev ON cur.employee_id = prev.employee_id
     ORDER BY COALESCE(cur.sort_order, prev.sort_order) ASC, employee_name ASC`,
    [currentRunId, previousRunId]
  );
  return rows as RunDiffRow[];
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

export type CloseTask = {
  id: string;
  company_id: string;
  label: string;
  done: number;
  sort_order: number;
};

export async function getCloseTasks(): Promise<CloseTask[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM close_tasks WHERE company_id = $1 ORDER BY sort_order ASC",
    [COMPANY_ID]
  );
  return rows as CloseTask[];
}

export async function toggleCloseTask(id: string): Promise<CloseTask> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE close_tasks SET done = CASE WHEN done = 1 THEN 0 ELSE 1 END WHERE id = $1 AND company_id = $2 RETURNING *`,
    [id, COMPANY_ID]
  );
  return rows[0] as CloseTask;
}

export type OnboardingTask = {
  id: string;
  employee_id: string;
  label: string;
  done: number;
  sort_order: number;
};

export async function getOnboardingTasks(employeeId: string): Promise<OnboardingTask[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM onboarding_tasks WHERE employee_id = $1 ORDER BY sort_order ASC",
    [employeeId]
  );
  return rows as OnboardingTask[];
}

export async function toggleOnboardingTask(id: string): Promise<OnboardingTask> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE onboarding_tasks SET done = CASE WHEN done = 1 THEN 0 ELSE 1 END WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0] as OnboardingTask;
}

/** All employees whose onboarding checklist isn't fully complete yet — used by the Compliance/Close agents and the HR summary. */
export async function getIncompleteOnboardingCount(): Promise<number> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT ot.employee_id) as n FROM onboarding_tasks ot
     JOIN employees e ON e.id = ot.employee_id
     WHERE e.company_id = $1 AND ot.done = 0`,
    [COMPANY_ID]
  );
  return Number(rows[0]?.n ?? 0);
}

export type Invoice = {
  id: string;
  company_id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  issue_date: string;
  due_date: string;
  status: "draft" | "sent" | "paid" | "void";
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  notes: string | null;
  sort_order: number;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  sort_order: number;
};

export type BankTransaction = {
  id: string;
  company_id: string;
  txn_date: string;
  description: string;
  amount: number;
  direction: "credit" | "debit";
  category: string | null;
  status: "unmatched" | "matched";
  matched_invoice_id: string | null;
  matched_payroll_run_id: string | null;
  sort_order: number;
};

export async function getInvoices(): Promise<Invoice[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM invoices WHERE company_id = $1 ORDER BY sort_order ASC",
    [COMPANY_ID]
  );
  return rows as Invoice[];
}

export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY sort_order ASC",
    [invoiceId]
  );
  return rows as InvoiceItem[];
}

export type CreateInvoiceInput = {
  customerName: string;
  customerEmail: string | null;
  issueDate: string;
  dueDate: string;
  vatRate: number;
  notes: string | null;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
};

/** Creates a draft invoice and its line items, computing subtotal/VAT/total server-side rather than trusting client arithmetic. */
export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  await ready();
  const pool = getPool();

  const subtotal = input.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const vatAmount = Math.round(subtotal * (input.vatRate / 100) * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;

  const { rows: countRows } = await pool.query("SELECT COUNT(*) as n FROM invoices WHERE company_id = $1", [COMPANY_ID]);
  const nextNumber = 1041 + Number(countRows[0]?.n ?? 0);
  const invoiceId = randomUUID();

  await pool.query(
    `INSERT INTO invoices (id, company_id, invoice_number, customer_name, customer_email, issue_date, due_date, status, subtotal, vat_rate, vat_amount, total, notes, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11,$12,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM invoices WHERE company_id = $2))`,
    [
      invoiceId,
      COMPANY_ID,
      `INV-${nextNumber}`,
      input.customerName,
      input.customerEmail,
      input.issueDate,
      input.dueDate,
      subtotal,
      input.vatRate,
      vatAmount,
      total,
      input.notes,
    ]
  );

  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    await pool.query(
      `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), invoiceId, it.description, it.quantity, it.unitPrice, it.quantity * it.unitPrice, i]
    );
  }

  const { rows } = await pool.query("SELECT * FROM invoices WHERE id = $1", [invoiceId]);
  return rows[0] as Invoice;
}

export async function updateInvoiceStatus(id: string, status: Invoice["status"]): Promise<Invoice> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "UPDATE invoices SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *",
    [status, id, COMPANY_ID]
  );
  return rows[0] as Invoice;
}

export async function getBankTransactions(): Promise<BankTransaction[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT * FROM bank_transactions WHERE company_id = $1 ORDER BY sort_order ASC",
    [COMPANY_ID]
  );
  return rows as BankTransaction[];
}

/** Confirms a suggested (or manually chosen) match between a bank credit and an open invoice — marks both sides matched/paid in one step, the way a reconciliation screen actually works. */
export async function matchTransaction(
  transactionId: string,
  invoiceId: string
): Promise<{ transaction: BankTransaction; invoice: Invoice }> {
  await ready();
  const pool = getPool();
  const { rows: txnRows } = await pool.query(
    `UPDATE bank_transactions SET status = 'matched', matched_invoice_id = $1 WHERE id = $2 AND company_id = $3 RETURNING *`,
    [invoiceId, transactionId, COMPANY_ID]
  );
  const { rows: invRows } = await pool.query(
    `UPDATE invoices SET status = 'paid' WHERE id = $1 AND company_id = $2 RETURNING *`,
    [invoiceId, COMPANY_ID]
  );
  return { transaction: txnRows[0] as BankTransaction, invoice: invRows[0] as Invoice };
}

/** Undoes a match — puts the invoice back to "sent" and the transaction back to unmatched, in case a reviewer matched the wrong pair. */
export async function unmatchTransaction(transactionId: string): Promise<BankTransaction> {
  await ready();
  const pool = getPool();
  const { rows: existingRows } = await pool.query(
    "SELECT matched_invoice_id FROM bank_transactions WHERE id = $1 AND company_id = $2",
    [transactionId, COMPANY_ID]
  );
  const invoiceId = existingRows[0]?.matched_invoice_id as string | undefined;
  const { rows } = await pool.query(
    `UPDATE bank_transactions SET status = 'unmatched', matched_invoice_id = NULL WHERE id = $1 AND company_id = $2 RETURNING *`,
    [transactionId, COMPANY_ID]
  );
  if (invoiceId) {
    await pool.query(`UPDATE invoices SET status = 'sent' WHERE id = $1 AND company_id = $2`, [invoiceId, COMPANY_ID]);
  }
  return rows[0] as BankTransaction;
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
