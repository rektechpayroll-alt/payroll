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
  matched_bill_id: string | null;
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

// ---------------------------------------------------------------------------
// Quotes — the sales-side precursor to an invoice (Send Quotes)
// ---------------------------------------------------------------------------

export type Quote = {
  id: string;
  company_id: string;
  quote_number: string;
  customer_name: string;
  customer_email: string | null;
  issue_date: string;
  expiry_date: string;
  status: "draft" | "sent" | "accepted" | "declined" | "converted";
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  converted_invoice_id: string | null;
  sort_order: number;
};

export async function getQuotes(): Promise<Quote[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM quotes WHERE company_id = $1 ORDER BY sort_order ASC", [COMPANY_ID]);
  return rows as Quote[];
}

export type CreateQuoteInput = {
  customerName: string;
  customerEmail: string | null;
  expiryDate: string;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
};

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  await ready();
  const pool = getPool();
  const subtotal = input.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const vatAmount = Math.round(subtotal * 0.2 * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  const { rows: countRows } = await pool.query("SELECT COUNT(*) as n FROM quotes WHERE company_id = $1", [COMPANY_ID]);
  const nextNumber = 2001 + Number(countRows[0]?.n ?? 0);
  const quoteId = randomUUID();

  await pool.query(
    `INSERT INTO quotes (id, company_id, quote_number, customer_name, customer_email, issue_date, expiry_date, status, subtotal, vat_rate, vat_amount, total, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8,20,$9,$10,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM quotes WHERE company_id = $2))`,
    [
      quoteId,
      COMPANY_ID,
      `QUO-${nextNumber}`,
      input.customerName,
      input.customerEmail,
      new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      input.expiryDate,
      subtotal,
      vatAmount,
      total,
    ]
  );
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    await pool.query(
      `INSERT INTO quote_items (id, quote_id, description, quantity, unit_price, amount, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), quoteId, it.description, it.quantity, it.unitPrice, it.quantity * it.unitPrice, i]
    );
  }
  const { rows } = await pool.query("SELECT * FROM quotes WHERE id = $1", [quoteId]);
  return rows[0] as Quote;
}

export async function updateQuoteStatus(id: string, status: Quote["status"]): Promise<Quote> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("UPDATE quotes SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *", [status, id, COMPANY_ID]);
  return rows[0] as Quote;
}

/** Converts an accepted quote into a real draft invoice, copying its line items — the natural quote -> invoice flow. */
export async function convertQuoteToInvoice(quoteId: string): Promise<{ quote: Quote; invoice: Invoice }> {
  await ready();
  const pool = getPool();
  const { rows: quoteRows } = await pool.query("SELECT * FROM quotes WHERE id = $1 AND company_id = $2", [quoteId, COMPANY_ID]);
  const quote = quoteRows[0] as Quote | undefined;
  if (!quote) throw new Error("Quote not found");

  const { rows: itemRows } = await pool.query("SELECT * FROM quote_items WHERE quote_id = $1 ORDER BY sort_order ASC", [quoteId]);
  const items = (itemRows as InvoiceItem[]).map((it) => ({ description: it.description, quantity: it.quantity, unitPrice: it.unit_price }));

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);
  const invoice = await createInvoice({
    customerName: quote.customer_name,
    customerEmail: quote.customer_email,
    issueDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    dueDate: dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    vatRate: quote.vat_rate,
    notes: `Converted from ${quote.quote_number}`,
    items,
  });
  await pool.query("UPDATE quotes SET status = 'converted', converted_invoice_id = $1 WHERE id = $2", [invoice.id, quoteId]);
  await updateInvoiceStatus(invoice.id, "sent");
  const { rows } = await pool.query("SELECT * FROM quotes WHERE id = $1", [quoteId]);
  return { quote: rows[0] as Quote, invoice: { ...invoice, status: "sent" } };
}

// ---------------------------------------------------------------------------
// Accept Payments — a payment link per invoice (simulated card capture, same
// honesty pattern the rest of the demo uses for HMRC/BACS submission)
// ---------------------------------------------------------------------------

export async function getInvoiceById(id: string): Promise<Invoice | null> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM invoices WHERE id = $1 AND company_id = $2", [id, COMPANY_ID]);
  return (rows[0] as Invoice) ?? null;
}

/** Records a simulated card payment: marks the invoice paid and drops a matched credit onto the bank feed, the fast path alongside bank-transfer reconciliation. */
export async function payInvoiceByCard(id: string): Promise<Invoice> {
  await ready();
  const pool = getPool();
  const invoice = await getInvoiceById(id);
  if (!invoice) throw new Error("Invoice not found");

  const txnId = randomUUID();
  await pool.query(
    `INSERT INTO bank_transactions (id, company_id, txn_date, description, amount, direction, category, status, matched_invoice_id, sort_order)
     VALUES ($1,$2,$3,$4,$5,'credit',NULL,'matched',$6,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM bank_transactions WHERE company_id = $2))`,
    [
      txnId,
      COMPANY_ID,
      new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      `CARD PAYMENT (demo) — ${invoice.customer_name}`,
      invoice.total,
      id,
    ]
  );
  return updateInvoiceStatus(id, "paid");
}

// ---------------------------------------------------------------------------
// Bills & Purchase Orders — accounts payable (Pay Bills, Create Purchase Orders)
// ---------------------------------------------------------------------------

export type Bill = {
  id: string;
  company_id: string;
  bill_reference: string;
  supplier_name: string;
  category: string | null;
  bill_date: string;
  due_date: string;
  status: "unpaid" | "paid" | "void";
  total: number;
  source_purchase_order_id: string | null;
  sort_order: number;
};

export async function getBills(): Promise<Bill[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM bills WHERE company_id = $1 ORDER BY sort_order ASC", [COMPANY_ID]);
  return rows as Bill[];
}

export async function createBill(input: { supplierName: string; category: string | null; billDate: string; dueDate: string; total: number }): Promise<Bill> {
  await ready();
  const pool = getPool();
  const { rows: countRows } = await pool.query("SELECT COUNT(*) as n FROM bills WHERE company_id = $1", [COMPANY_ID]);
  const nextNumber = 3001 + Number(countRows[0]?.n ?? 0);
  const billId = randomUUID();
  await pool.query(
    `INSERT INTO bills (id, company_id, bill_reference, supplier_name, category, bill_date, due_date, status, total, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'unpaid',$8,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM bills WHERE company_id = $2))`,
    [billId, COMPANY_ID, `BILL-${nextNumber}`, input.supplierName, input.category, input.billDate, input.dueDate, input.total]
  );
  const { rows } = await pool.query("SELECT * FROM bills WHERE id = $1", [billId]);
  return rows[0] as Bill;
}

/** Pays a bill: marks it paid and drops a matched debit onto the bank feed, mirroring how a confirmed invoice payment works on the sales side. */
export async function payBill(id: string): Promise<Bill> {
  await ready();
  const pool = getPool();
  const { rows: billRows } = await pool.query("SELECT * FROM bills WHERE id = $1 AND company_id = $2", [id, COMPANY_ID]);
  const bill = billRows[0] as Bill | undefined;
  if (!bill) throw new Error("Bill not found");

  await pool.query(
    `INSERT INTO bank_transactions (id, company_id, txn_date, description, amount, direction, category, status, matched_bill_id, sort_order)
     VALUES ($1,$2,$3,$4,$5,'debit',$6,'matched',$7,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM bank_transactions WHERE company_id = $2))`,
    [
      randomUUID(),
      COMPANY_ID,
      new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      `${bill.supplier_name.toUpperCase()} — ${bill.bill_reference}`,
      bill.total,
      bill.category,
      id,
    ]
  );
  const { rows } = await pool.query("UPDATE bills SET status = 'paid' WHERE id = $1 AND company_id = $2 RETURNING *", [id, COMPANY_ID]);
  return rows[0] as Bill;
}

export type PurchaseOrder = {
  id: string;
  company_id: string;
  po_number: string;
  supplier_name: string;
  order_date: string;
  status: "draft" | "sent" | "received" | "converted_to_bill";
  total: number;
  converted_bill_id: string | null;
  sort_order: number;
};

export async function getPurchaseOrders(): Promise<PurchaseOrder[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM purchase_orders WHERE company_id = $1 ORDER BY sort_order ASC", [COMPANY_ID]);
  return rows as PurchaseOrder[];
}

export type CreatePurchaseOrderInput = {
  supplierName: string;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
};

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  await ready();
  const pool = getPool();
  const total = input.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
  const { rows: countRows } = await pool.query("SELECT COUNT(*) as n FROM purchase_orders WHERE company_id = $1", [COMPANY_ID]);
  const nextNumber = 4001 + Number(countRows[0]?.n ?? 0);
  const poId = randomUUID();
  await pool.query(
    `INSERT INTO purchase_orders (id, company_id, po_number, supplier_name, order_date, status, total, sort_order)
     VALUES ($1,$2,$3,$4,$5,'draft',$6,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM purchase_orders WHERE company_id = $2))`,
    [poId, COMPANY_ID, `PO-${nextNumber}`, input.supplierName, new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), total]
  );
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i];
    await pool.query(
      `INSERT INTO purchase_order_items (id, po_id, description, quantity, unit_price, amount, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), poId, it.description, it.quantity, it.unitPrice, it.quantity * it.unitPrice, i]
    );
  }
  const { rows } = await pool.query("SELECT * FROM purchase_orders WHERE id = $1", [poId]);
  return rows[0] as PurchaseOrder;
}

export async function updatePurchaseOrderStatus(id: string, status: PurchaseOrder["status"]): Promise<PurchaseOrder> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("UPDATE purchase_orders SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *", [status, id, COMPANY_ID]);
  return rows[0] as PurchaseOrder;
}

/** Converts a received PO into a real bill, copying its total across — the natural PO -> Bill flow once goods/services arrive. */
export async function convertPurchaseOrderToBill(poId: string): Promise<{ purchaseOrder: PurchaseOrder; bill: Bill }> {
  await ready();
  const pool = getPool();
  const { rows: poRows } = await pool.query("SELECT * FROM purchase_orders WHERE id = $1 AND company_id = $2", [poId, COMPANY_ID]);
  const po = poRows[0] as PurchaseOrder | undefined;
  if (!po) throw new Error("Purchase order not found");

  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 14);
  const bill = await createBill({
    supplierName: po.supplier_name,
    category: "Purchase order",
    billDate: today.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    dueDate: due.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    total: po.total,
  });
  await pool.query("UPDATE bills SET source_purchase_order_id = $1 WHERE id = $2", [poId, bill.id]);
  await pool.query("UPDATE purchase_orders SET status = 'converted_to_bill', converted_bill_id = $1 WHERE id = $2", [bill.id, poId]);
  const { rows } = await pool.query("SELECT * FROM purchase_orders WHERE id = $1", [poId]);
  return { purchaseOrder: rows[0] as PurchaseOrder, bill: { ...bill, source_purchase_order_id: poId } };
}

// ---------------------------------------------------------------------------
// Inventory — signage, branded merchandise & equipment stock (Manage Inventory)
// ---------------------------------------------------------------------------

export type InventoryItem = {
  id: string;
  company_id: string;
  sku: string;
  name: string;
  category: string;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost: number;
  sort_order: number;
};

export type InventoryMovement = {
  id: string;
  item_id: string;
  change: number;
  reason: string;
  occurred_at: string;
  sort_order: number;
};

export async function getInventoryItems(): Promise<InventoryItem[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM inventory_items WHERE company_id = $1 ORDER BY sort_order ASC", [COMPANY_ID]);
  return rows as InventoryItem[];
}

export async function getInventoryMovements(itemId: string): Promise<InventoryMovement[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM inventory_movements WHERE item_id = $1 ORDER BY sort_order DESC", [itemId]);
  return rows as InventoryMovement[];
}

/** Adjusts stock on hand and logs the movement in one step — the stock ledger is derived from movements, never edited directly. */
export async function adjustStock(itemId: string, change: number, reason: string): Promise<InventoryItem> {
  await ready();
  const pool = getPool();
  await pool.query(
    `INSERT INTO inventory_movements (id, item_id, change, reason, occurred_at, sort_order)
     VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM inventory_movements WHERE item_id = $2))`,
    [randomUUID(), itemId, change, reason, new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })]
  );
  const { rows } = await pool.query(
    "UPDATE inventory_items SET quantity_on_hand = quantity_on_hand + $1 WHERE id = $2 AND company_id = $3 RETURNING *",
    [change, itemId, COMPANY_ID]
  );
  return rows[0] as InventoryItem;
}

// ---------------------------------------------------------------------------
// Expense claims & mileage tracking (Claim Expenses, Mileage Tracking)
// ---------------------------------------------------------------------------

export type ExpenseClaim = {
  id: string;
  company_id: string;
  employee_id: string;
  description: string;
  category: string;
  amount: number;
  expense_date: string;
  status: "submitted" | "approved" | "reimbursed" | "rejected";
  sort_order: number;
};

export async function getExpenseClaims(): Promise<ExpenseClaim[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM expense_claims WHERE company_id = $1 ORDER BY sort_order DESC", [COMPANY_ID]);
  return rows as ExpenseClaim[];
}

export async function createExpenseClaim(input: { employeeId: string; description: string; category: string; amount: number; expenseDate: string }): Promise<ExpenseClaim> {
  await ready();
  const pool = getPool();
  const claimId = randomUUID();
  await pool.query(
    `INSERT INTO expense_claims (id, company_id, employee_id, description, category, amount, expense_date, status, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'submitted',(SELECT COALESCE(MAX(sort_order),-1)+1 FROM expense_claims WHERE company_id = $2))`,
    [claimId, COMPANY_ID, input.employeeId, input.description, input.category, input.amount, input.expenseDate]
  );
  const { rows } = await pool.query("SELECT * FROM expense_claims WHERE id = $1", [claimId]);
  return rows[0] as ExpenseClaim;
}

export async function updateExpenseClaimStatus(id: string, status: ExpenseClaim["status"]): Promise<ExpenseClaim> {
  await ready();
  const pool = getPool();
  if (status === "reimbursed") {
    const { rows: claimRows } = await pool.query("SELECT * FROM expense_claims WHERE id = $1 AND company_id = $2", [id, COMPANY_ID]);
    const claim = claimRows[0] as ExpenseClaim | undefined;
    if (claim) {
      const { rows: empRows } = await pool.query("SELECT name FROM employees WHERE id = $1", [claim.employee_id]);
      const employeeName = (empRows[0]?.name as string | undefined) ?? "employee";
      await pool.query(
        `INSERT INTO bank_transactions (id, company_id, txn_date, description, amount, direction, category, status, sort_order)
         VALUES ($1,$2,$3,$4,$5,'debit','Expense reimbursement','unmatched',(SELECT COALESCE(MAX(sort_order),-1)+1 FROM bank_transactions WHERE company_id = $2))`,
        [
          randomUUID(),
          COMPANY_ID,
          new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
          `EXPENSE REIMBURSEMENT — ${employeeName.toUpperCase()}`,
          claim.amount,
        ]
      );
    }
  }
  const { rows } = await pool.query("UPDATE expense_claims SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *", [status, id, COMPANY_ID]);
  return rows[0] as ExpenseClaim;
}

export type MileageClaim = {
  id: string;
  company_id: string;
  employee_id: string;
  trip_date: string;
  from_location: string;
  to_location: string;
  miles: number;
  rate_per_mile: number;
  amount: number;
  status: "submitted" | "approved" | "reimbursed";
  sort_order: number;
};

const MILEAGE_RATE = 0.45; // HMRC AMAP rate, first 10,000 business miles

export async function getMileageClaims(): Promise<MileageClaim[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM mileage_claims WHERE company_id = $1 ORDER BY sort_order DESC", [COMPANY_ID]);
  return rows as MileageClaim[];
}

export async function createMileageClaim(input: { employeeId: string; tripDate: string; from: string; to: string; miles: number }): Promise<MileageClaim> {
  await ready();
  const pool = getPool();
  const amount = Math.round(input.miles * MILEAGE_RATE * 100) / 100;
  const claimId = randomUUID();
  await pool.query(
    `INSERT INTO mileage_claims (id, company_id, employee_id, trip_date, from_location, to_location, miles, rate_per_mile, amount, status, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'submitted',(SELECT COALESCE(MAX(sort_order),-1)+1 FROM mileage_claims WHERE company_id = $2))`,
    [claimId, COMPANY_ID, input.employeeId, input.tripDate, input.from, input.to, input.miles, MILEAGE_RATE, amount]
  );
  const { rows } = await pool.query("SELECT * FROM mileage_claims WHERE id = $1", [claimId]);
  return rows[0] as MileageClaim;
}

export async function updateMileageClaimStatus(id: string, status: MileageClaim["status"]): Promise<MileageClaim> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("UPDATE mileage_claims SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *", [status, id, COMPANY_ID]);
  return rows[0] as MileageClaim;
}

// ---------------------------------------------------------------------------
// Projects & time tracking (Track Projects)
// ---------------------------------------------------------------------------

export type Project = {
  id: string;
  company_id: string;
  name: string;
  client_name: string;
  status: "active" | "completed" | "on_hold";
  budget: number;
  hourly_rate: number;
  start_date: string;
  sort_order: number;
};

export type ProjectTimeEntry = {
  id: string;
  project_id: string;
  employee_id: string | null;
  employee_name: string;
  hours: number;
  entry_date: string;
  note: string | null;
  sort_order: number;
};

export async function getProjects(): Promise<Project[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM projects WHERE company_id = $1 ORDER BY sort_order ASC", [COMPANY_ID]);
  return rows as Project[];
}

export async function getProjectTimeEntries(projectId: string): Promise<ProjectTimeEntry[]> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM project_time_entries WHERE project_id = $1 ORDER BY sort_order DESC", [projectId]);
  return rows as ProjectTimeEntry[];
}

export async function createProject(input: { name: string; clientName: string; budget: number; startDate: string }): Promise<Project> {
  await ready();
  const pool = getPool();
  const projectId = randomUUID();
  await pool.query(
    `INSERT INTO projects (id, company_id, name, client_name, status, budget, hourly_rate, start_date, sort_order)
     VALUES ($1,$2,$3,$4,'active',$5,45,$6,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM projects WHERE company_id = $2))`,
    [projectId, COMPANY_ID, input.name, input.clientName, input.budget, input.startDate]
  );
  const { rows } = await pool.query("SELECT * FROM projects WHERE id = $1", [projectId]);
  return rows[0] as Project;
}

export async function logProjectTime(input: { projectId: string; employeeId: string; hours: number; note: string | null }): Promise<ProjectTimeEntry> {
  await ready();
  const pool = getPool();
  const { rows: empRows } = await pool.query("SELECT name FROM employees WHERE id = $1", [input.employeeId]);
  const employeeName = (empRows[0]?.name as string | undefined) ?? "Unknown";
  const entryId = randomUUID();
  await pool.query(
    `INSERT INTO project_time_entries (id, project_id, employee_id, employee_name, hours, entry_date, note, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM project_time_entries WHERE project_id = $2))`,
    [
      entryId,
      input.projectId,
      input.employeeId,
      employeeName,
      input.hours,
      new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
      input.note,
    ]
  );
  const { rows } = await pool.query("SELECT * FROM project_time_entries WHERE id = $1", [entryId]);
  return rows[0] as ProjectTimeEntry;
}

export async function updateProjectStatus(id: string, status: Project["status"]): Promise<Project> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("UPDATE projects SET status = $1 WHERE id = $2 AND company_id = $3 RETURNING *", [status, id, COMPANY_ID]);
  return rows[0] as Project;
}
