import { randomUUID } from "node:crypto";
import { getPool, ready } from "@/lib/db";
import { addDays } from "@/lib/insights/forecast";
import { ledgerDate } from "@/lib/ledger/posting";
import { taxYearFor } from "@/lib/payroll/rates";
import { createInvoice } from "@/lib/queries";
import { currentCompanyId } from "@/lib/tenant";
import { ProjectError } from "./assert";
import { employeeCostRate, projectFinancials, type ProjectBilling, type ProjectFinancials } from "./costing";

/** Projects: time and costs against a budget, invoicing from unbilled work, and real profitability. */

export { ProjectError };

const round2 = (n: number) => Math.round(n * 100) / 100;
const iso = /^\d{4}-\d{2}-\d{2}$/;
const todayIso = () => new Date().toISOString().slice(0, 10);
const STATUSES = ["active", "on_hold", "completed"] as const;
const BILLING: ProjectBilling[] = ["hourly", "fixed", "non_billable"];

export type ProjectRow = {
  id: string;
  name: string;
  client_name: string;
  status: (typeof STATUSES)[number];
  billing: ProjectBilling;
  hourly_rate: number;
  fixed_price: number | null;
  budget: number;
  start_date: string;
  due_date: string | null;
};

export type TimeEntry = { id: string; employee_name: string; entry_date: string; hours: number; billable: boolean; bill_rate: number; cost_rate: number; note: string | null; invoice_number: string | null };
export type CostLine = { id: string; source: "cost" | "bill" | "claim"; date: string; description: string; amount: number; billable: boolean; markup_pct: number; invoice_number: string | null };
export type ProjectInvoice = { id: string; invoice_number: string; issue_date: string; status: string; subtotal: number; total: number };

async function projectFor(companyId: string, id: string): Promise<ProjectRow> {
  const { rows } = await getPool().query("SELECT * FROM projects WHERE id = $1 AND company_id = $2", [id, companyId]);
  if (!rows[0]) throw new ProjectError("That project doesn't exist.");
  const p = rows[0];
  return { ...p, billing: p.billing ?? "hourly", start_date: ledgerDate(p.start_date), due_date: p.due_date ? ledgerDate(p.due_date) : null };
}

// Invoices count as billing work unless voided; voiding an invoice frees its time and costs to bill again.
const LIVE_INVOICE = "(SELECT invoice_number FROM invoices i WHERE i.id = x.invoice_id AND i.status <> 'void')";

async function projectDetail(companyId: string, p: ProjectRow) {
  const pool = getPool();
  const [{ rows: time }, { rows: own }, { rows: bills }, { rows: claims }, { rows: invoices }] = await Promise.all([
    pool.query(
      `SELECT x.*, ${LIVE_INVOICE} AS invoice_number FROM project_time_entries x WHERE x.project_id = $1 ORDER BY x.sort_order DESC`,
      [p.id]
    ),
    pool.query(`SELECT x.*, to_char(x.cost_date, 'YYYY-MM-DD') AS d, ${LIVE_INVOICE} AS invoice_number FROM project_costs x WHERE x.project_id = $1 AND x.company_id = $2 ORDER BY x.cost_date DESC`, [p.id, companyId]),
    pool.query("SELECT * FROM bills WHERE project_id = $1 AND company_id = $2 AND status <> 'void'", [p.id, companyId]),
    pool.query("SELECT * FROM expense_claims WHERE project_id = $1 AND company_id = $2 AND status IN ('approved', 'reimbursed')", [p.id, companyId]),
    pool.query("SELECT id, invoice_number, issue_date, status, subtotal, total FROM invoices WHERE project_id = $1 AND company_id = $2 ORDER BY sort_order DESC", [p.id, companyId]),
  ]);

  const entries: TimeEntry[] = time.map((t) => ({
    id: t.id,
    employee_name: t.employee_name,
    entry_date: ledgerDate(t.entry_date),
    hours: t.hours,
    billable: t.billable,
    // Entries logged before rates were captured fall back to the project's rate and no cost.
    bill_rate: t.bill_rate ?? p.hourly_rate,
    cost_rate: t.cost_rate ?? 0,
    note: t.note,
    invoice_number: t.invoice_number,
  }));
  const costs: CostLine[] = [
    ...own.map((c) => ({ id: c.id, source: "cost" as const, date: c.d, description: c.description, amount: c.amount, billable: c.billable, markup_pct: c.markup_pct, invoice_number: c.invoice_number })),
    ...bills.map((b) => ({ id: b.id, source: "bill" as const, date: ledgerDate(b.bill_date), description: `Bill ${b.bill_reference} — ${b.supplier_name}`, amount: round2(b.total - (b.vat_amount ?? 0)), billable: false, markup_pct: 0, invoice_number: null })),
    ...claims.map((c) => ({ id: c.id, source: "claim" as const, date: ledgerDate(c.expense_date), description: `Expense claim — ${c.description}`, amount: round2(c.amount - (c.vat_amount ?? 0)), billable: false, markup_pct: 0, invoice_number: null })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  const projectInvoices: ProjectInvoice[] = invoices.map((i) => ({ ...i, issue_date: ledgerDate(i.issue_date) }));

  const financials = projectFinancials({
    billing: p.billing,
    fixedPrice: p.fixed_price,
    budget: p.budget,
    time: entries.map((t) => ({ hours: t.hours, billable: t.billable, billRate: t.bill_rate, costRate: t.cost_rate, invoiced: !!t.invoice_number })),
    costs: costs.map((c) => ({ amount: c.amount, billable: c.billable, markupPct: c.markup_pct, invoiced: !!c.invoice_number })),
    invoiced: projectInvoices.filter((i) => i.status === "sent" || i.status === "paid").reduce((s, i) => s + i.subtotal, 0),
  });
  return { project: p, entries, costs, invoices: projectInvoices, financials };
}

export type ProjectSummary = ProjectRow & { financials: ProjectFinancials };

export async function listProjects(): Promise<ProjectSummary[]> {
  await ready();
  const companyId = await currentCompanyId();
  const { rows } = await getPool().query("SELECT id FROM projects WHERE company_id = $1 ORDER BY sort_order DESC", [companyId]);
  const out: ProjectSummary[] = [];
  for (const r of rows) {
    const d = await projectDetail(companyId, await projectFor(companyId, r.id));
    out.push({ ...d.project, financials: d.financials });
  }
  return out;
}

export async function getProject(id: string) {
  await ready();
  const companyId = await currentCompanyId();
  return projectDetail(companyId, await projectFor(companyId, id));
}

export type ProjectInput = {
  name: string;
  clientName: string;
  billing: ProjectBilling;
  hourlyRate: number;
  fixedPrice: number | null;
  budget: number;
  startDate: string;
  dueDate: string | null;
};

function validate(input: ProjectInput): ProjectInput {
  const name = input.name?.trim();
  const clientName = input.clientName?.trim();
  if (!name) throw new ProjectError("Give the project a name.");
  if (!clientName) throw new ProjectError("Who is the project for?");
  if (!BILLING.includes(input.billing)) throw new ProjectError("Choose how the project is billed.");
  if (input.billing === "hourly" && !(input.hourlyRate > 0)) throw new ProjectError("Enter the hourly rate you charge.");
  if (input.billing === "fixed" && !(Number(input.fixedPrice) > 0)) throw new ProjectError("Enter the fixed price.");
  if (!(input.budget >= 0)) throw new ProjectError("The cost budget can't be negative.");
  if (!iso.test(input.startDate)) throw new ProjectError("Choose a start date.");
  if (input.dueDate && !iso.test(input.dueDate)) throw new ProjectError("Choose a valid due date.");
  return { ...input, name, clientName, fixedPrice: input.billing === "fixed" ? round2(Number(input.fixedPrice)) : null, hourlyRate: round2(input.hourlyRate || 0), budget: round2(input.budget) };
}

export async function createProject(input: ProjectInput): Promise<string> {
  await ready();
  const v = validate(input);
  const companyId = await currentCompanyId();
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO projects (id, company_id, name, client_name, status, budget, hourly_rate, start_date, billing, fixed_price, due_date, sort_order)
     VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM projects WHERE company_id = $2))`,
    [id, companyId, v.name, v.clientName, v.budget, v.hourlyRate, v.startDate, v.billing, v.fixedPrice, v.dueDate]
  );
  return id;
}

export async function updateProject(id: string, input: ProjectInput): Promise<void> {
  await ready();
  const v = validate(input);
  const companyId = await currentCompanyId();
  await projectFor(companyId, id);
  await getPool().query(
    `UPDATE projects SET name = $3, client_name = $4, budget = $5, hourly_rate = $6, start_date = $7, billing = $8, fixed_price = $9, due_date = $10
     WHERE id = $1 AND company_id = $2`,
    [id, companyId, v.name, v.clientName, v.budget, v.hourlyRate, v.startDate, v.billing, v.fixedPrice, v.dueDate]
  );
}

export async function setProjectStatus(id: string, status: string): Promise<void> {
  await ready();
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) throw new ProjectError("Unknown project status.");
  const companyId = await currentCompanyId();
  await projectFor(companyId, id);
  await getPool().query("UPDATE projects SET status = $3 WHERE id = $1 AND company_id = $2", [id, companyId, status]);
}

/** Logs time, capturing today's bill rate and the person's cost rate so later pay rises don't rewrite history. */
export async function logTime(input: { projectId: string; employeeId: string; date: string; hours: number; billable: boolean; note: string | null }): Promise<string> {
  await ready();
  const companyId = await currentCompanyId();
  const p = await projectFor(companyId, input.projectId);
  if (!iso.test(input.date)) throw new ProjectError("Choose the date the work was done.");
  if (!(input.hours > 0 && input.hours <= 24)) throw new ProjectError("Hours must be between 0 and 24.");
  const { rows } = await getPool().query("SELECT * FROM employees WHERE id = $1 AND company_id = $2", [input.employeeId, companyId]);
  const e = rows[0];
  if (!e) throw new ProjectError("Choose someone from your team.");
  const costRate = employeeCostRate(e, taxYearFor(input.date));
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO project_time_entries (id, project_id, employee_id, employee_name, hours, entry_date, note, billable, bill_rate, cost_rate, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM project_time_entries WHERE project_id = $2))`,
    [id, p.id, e.id, e.name, round2(input.hours), input.date, input.note?.trim() || null, p.billing === "hourly" && input.billable, p.hourly_rate, costRate]
  );
  return id;
}

async function assertNotInvoiced(table: "project_time_entries" | "project_costs", id: string, companyId: string) {
  const scope = table === "project_costs" ? "x.company_id = $2" : "EXISTS (SELECT 1 FROM projects p WHERE p.id = x.project_id AND p.company_id = $2)";
  const { rows } = await getPool().query(`SELECT ${LIVE_INVOICE} AS invoice_number FROM ${table} x WHERE x.id = $1 AND ${scope}`, [id, companyId]);
  if (!rows[0]) throw new ProjectError("That entry no longer exists.");
  if (rows[0].invoice_number) throw new ProjectError(`That's on invoice ${rows[0].invoice_number} — void the invoice first.`);
}

export async function deleteTime(id: string): Promise<void> {
  await ready();
  const companyId = await currentCompanyId();
  await assertNotInvoiced("project_time_entries", id, companyId);
  await getPool().query("DELETE FROM project_time_entries WHERE id = $1", [id]);
}

export async function addCost(input: { projectId: string; date: string; description: string; amount: number; billable: boolean; markupPct: number }): Promise<string> {
  await ready();
  const companyId = await currentCompanyId();
  const p = await projectFor(companyId, input.projectId);
  if (!iso.test(input.date)) throw new ProjectError("Choose a date.");
  if (!input.description?.trim()) throw new ProjectError("Describe the cost.");
  if (!(input.amount > 0)) throw new ProjectError("Enter the cost, excluding VAT.");
  if (!(input.markupPct >= 0 && input.markupPct <= 500)) throw new ProjectError("Markup must be between 0% and 500%.");
  const id = randomUUID();
  await getPool().query(
    "INSERT INTO project_costs (id, company_id, project_id, cost_date, description, amount, billable, markup_pct) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    [id, companyId, p.id, input.date, input.description.trim(), round2(input.amount), p.billing === "hourly" && input.billable, round2(input.markupPct)]
  );
  return id;
}

export async function deleteCost(id: string): Promise<void> {
  await ready();
  const companyId = await currentCompanyId();
  await assertNotInvoiced("project_costs", id, companyId);
  await getPool().query("DELETE FROM project_costs WHERE id = $1 AND company_id = $2", [id, companyId]);
}

/**
 * Raises a draft invoice for the project. Hourly projects bill all unbilled time (grouped by
 * person and rate) and billable costs with their markup; fixed-price projects bill a stage
 * amount, never more than is left of the price.
 */
export async function invoiceProject(input: { projectId: string; amount?: number; description?: string; dueDays?: number; vatRate?: number }): Promise<{ id: string; number: string }> {
  await ready();
  const companyId = await currentCompanyId();
  const detail = await projectDetail(companyId, await projectFor(companyId, input.projectId));
  const { project: p, financials } = detail;
  const vatRate = [20, 5, 0].includes(input.vatRate ?? 20) ? input.vatRate ?? 20 : 20;
  const issueDate = todayIso();
  const dueDate = addDays(issueDate, Math.max(0, Math.min(120, input.dueDays ?? 30)));
  let items: Array<{ description: string; quantity: number; unitPrice: number }> = [];
  let timeIds: string[] = [];
  let costIds: string[] = [];

  if (p.billing === "non_billable") throw new ProjectError("This project isn't billed to a client.");
  if (p.billing === "fixed") {
    const amount = round2(Number(input.amount));
    if (!(amount > 0)) throw new ProjectError("Enter the amount to invoice for this stage.");
    if (amount > financials.leftToInvoice! + 0.001) throw new ProjectError(`Only ${financials.leftToInvoice!.toFixed(2)} of the fixed price is left to invoice.`);
    items = [{ description: input.description?.trim() || `${p.name} — stage payment`, quantity: 1, unitPrice: amount }];
  } else {
    const time = detail.entries.filter((t) => t.billable && !t.invoice_number);
    const costs = detail.costs.filter((c) => c.source === "cost" && c.billable && !c.invoice_number);
    if (!time.length && !costs.length) throw new ProjectError("There's no unbilled time or billable cost on this project.");
    const groups = new Map<string, { name: string; rate: number; hours: number }>();
    for (const t of time) {
      const key = `${t.employee_name}|${t.bill_rate}`;
      const g = groups.get(key) ?? { name: t.employee_name, rate: t.bill_rate, hours: 0 };
      g.hours = round2(g.hours + t.hours);
      groups.set(key, g);
    }
    items = [
      ...[...groups.values()].map((g) => ({ description: `${p.name} — ${g.name}, ${g.hours} hours`, quantity: g.hours, unitPrice: g.rate })),
      ...costs.map((c) => ({ description: `${c.description}${c.markup_pct ? ` (incl. ${c.markup_pct}% handling)` : ""}`, quantity: 1, unitPrice: round2(c.amount * (1 + c.markup_pct / 100)) })),
    ];
    timeIds = time.map((t) => t.id);
    costIds = costs.map((c) => c.id);
  }

  const invoice = await createInvoice({ customerName: p.client_name, customerEmail: null, issueDate, dueDate, vatRate, notes: `Project: ${p.name}`, items });
  const pool = getPool();
  await pool.query("UPDATE invoices SET project_id = $1 WHERE id = $2 AND company_id = $3", [p.id, invoice.id, companyId]);
  if (timeIds.length) await pool.query("UPDATE project_time_entries SET invoice_id = $1 WHERE id = ANY($2)", [invoice.id, timeIds]);
  if (costIds.length) await pool.query("UPDATE project_costs SET invoice_id = $1 WHERE id = ANY($2) AND company_id = $3", [invoice.id, costIds, companyId]);
  return { id: invoice.id, number: invoice.invoice_number };
}

/** Projects a bill or expense claim can be charged to. */
export async function projectOptions(): Promise<Array<{ id: string; name: string }>> {
  await ready();
  const { rows } = await getPool().query("SELECT id, name, client_name FROM projects WHERE company_id = $1 AND status <> 'completed' ORDER BY name", [await currentCompanyId()]);
  return rows.map((r) => ({ id: r.id, name: `${r.name} (${r.client_name})` }));
}
