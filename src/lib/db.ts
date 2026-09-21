import { Pool } from "pg";
import { randomUUID } from "node:crypto";

declare global {
  // eslint-disable-next-line no-var
  var __verityPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __verityReady: Promise<void> | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres instance (e.g. a Supabase connection string)."
    );
  }
  // Local Postgres (used in dev/CI) has no TLS listener; hosted providers
  // (Supabase, Vercel Postgres, Neon, ...) require SSL — sslmode is the signal.
  const needsSsl = /sslmode=require/.test(connectionString) || /supabase|neon\.tech|vercel-storage/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
}

export function getPool(): Pool {
  if (!globalThis.__verityPool) {
    globalThis.__verityPool = makePool();
  }
  return globalThis.__verityPool;
}

async function createSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      employee_count INTEGER NOT NULL,
      pay_schedule TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll_runs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      period_label TEXT NOT NULL,
      pay_period TEXT NOT NULL,
      payday TEXT NOT NULL,
      bacs_cutoff_label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      gross_pay DOUBLE PRECISION NOT NULL,
      employer_ni DOUBLE PRECISION NOT NULL,
      employer_pension DOUBLE PRECISION NOT NULL,
      net_pay DOUBLE PRECISION NOT NULL,
      connected_balance DOUBLE PRECISION NOT NULL,
      mid_month_note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS payroll_lines (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
      employee_name TEXT NOT NULL,
      role TEXT NOT NULL,
      net_pay DOUBLE PRECISION NOT NULL,
      severity TEXT,
      source TEXT,
      tag_label TEXT,
      reason TEXT,
      delta_pct DOUBLE PRECISION,
      resolved INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      detail TEXT,
      occurred_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS cost_trend (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      month_label TEXT NOT NULL,
      cost_to_company DOUBLE PRECISION NOT NULL,
      deals_index DOUBLE PRECISION NOT NULL,
      headcount_index DOUBLE PRECISION NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recommendations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      body TEXT NOT NULL,
      sort_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS profitability_stats (
      company_id TEXT PRIMARY KEY,
      bonus_budget DOUBLE PRECISION NOT NULL,
      bonus_budget_note TEXT NOT NULL,
      optimum_role TEXT NOT NULL,
      optimum_salary_low DOUBLE PRECISION NOT NULL,
      optimum_salary_high DOUBLE PRECISION NOT NULL,
      optimum_salary_current DOUBLE PRECISION NOT NULL,
      staffing_note TEXT NOT NULL,
      staffing_fte_delta DOUBLE PRECISION NOT NULL,
      staffing_flag TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      email TEXT NOT NULL,
      employment_type TEXT NOT NULL,
      start_date TEXT NOT NULL,
      tax_code TEXT NOT NULL,
      ni_number TEXT NOT NULL,
      weekly_hours DOUBLE PRECISION NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS integrations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_connected',
      last_synced_at TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS close_tasks (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS onboarding_tasks (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      issue_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal DOUBLE PRECISION NOT NULL,
      vat_rate DOUBLE PRECISION NOT NULL DEFAULT 20,
      vat_amount DOUBLE PRECISION NOT NULL,
      total DOUBLE PRECISION NOT NULL,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
      unit_price DOUBLE PRECISION NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      txn_date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      direction TEXT NOT NULL,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'unmatched',
      matched_invoice_id TEXT REFERENCES invoices(id),
      matched_payroll_run_id TEXT REFERENCES payroll_runs(id),
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      quote_number TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      issue_date TEXT NOT NULL,
      expiry_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal DOUBLE PRECISION NOT NULL,
      vat_rate DOUBLE PRECISION NOT NULL DEFAULT 20,
      vat_amount DOUBLE PRECISION NOT NULL,
      total DOUBLE PRECISION NOT NULL,
      converted_invoice_id TEXT REFERENCES invoices(id),
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quote_items (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
      unit_price DOUBLE PRECISION NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      bill_reference TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      category TEXT,
      bill_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unpaid',
      total DOUBLE PRECISION NOT NULL,
      source_purchase_order_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      po_number TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      order_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      total DOUBLE PRECISION NOT NULL,
      converted_bill_id TEXT REFERENCES bills(id),
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id TEXT PRIMARY KEY,
      po_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
      unit_price DOUBLE PRECISION NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity_on_hand INTEGER NOT NULL DEFAULT 0,
      reorder_level INTEGER NOT NULL DEFAULT 0,
      unit_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
      change INTEGER NOT NULL,
      reason TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS expense_claims (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      expense_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS mileage_claims (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      trip_date TEXT NOT NULL,
      from_location TEXT NOT NULL,
      to_location TEXT NOT NULL,
      miles DOUBLE PRECISION NOT NULL,
      rate_per_mile DOUBLE PRECISION NOT NULL DEFAULT 0.45,
      amount DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL DEFAULT 'submitted',
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      client_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      budget DOUBLE PRECISION NOT NULL,
      hourly_rate DOUBLE PRECISION NOT NULL DEFAULT 45,
      start_date TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS project_time_entries (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      employee_id TEXT REFERENCES employees(id),
      employee_name TEXT NOT NULL,
      hours DOUBLE PRECISION NOT NULL,
      entry_date TEXT NOT NULL,
      note TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS fixed_assets (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      purchase_date TEXT NOT NULL,
      purchase_cost DOUBLE PRECISION NOT NULL,
      useful_life_years DOUBLE PRECISION NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS budget_lines (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      period_label TEXT NOT NULL,
      budgeted_amount DOUBLE PRECISION NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Additive migrations for databases created before this schema revision —
  // CREATE TABLE IF NOT EXISTS above won't add columns to a table that
  // already exists, so any new column on a pre-existing table needs its own
  // idempotent ALTER TABLE here.
  await pool.query(`
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_on_flag BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_on_approval BOOLEAN NOT NULL DEFAULT true;
    ALTER TABLE companies ADD COLUMN IF NOT EXISTS approval_mode TEXT NOT NULL DEFAULT 'manual';
    ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS employee_id TEXT REFERENCES employees(id);
    ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS matched_bill_id TEXT REFERENCES bills(id);
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GBP';
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fx_rate DOUBLE PRECISION NOT NULL DEFAULT 1;
    ALTER TABLE invoices ADD COLUMN IF NOT EXISTS original_total DOUBLE PRECISION;
    ALTER TABLE bills ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GBP';
    ALTER TABLE bills ADD COLUMN IF NOT EXISTS fx_rate DOUBLE PRECISION NOT NULL DEFAULT 1;
    ALTER TABLE bills ADD COLUMN IF NOT EXISTS original_total DOUBLE PRECISION;
  `);
}

async function seed(): Promise<void> {
  const pool = getPool();
  const companyId = "harrow-vale";
  const existing = await pool.query("SELECT id FROM companies WHERE id = $1", [companyId]);
  if (existing.rowCount) {
    // Base seed already ran in an earlier version of the schema — still make
    // sure anything added since (employees, integrations) gets backfilled.
    await seedEmployeesAndIntegrations(companyId);
    await seedCloseTasks(companyId);
    await seedPriorRun(companyId);
    await seedLedger(companyId);
    await seedBusinessOps(companyId);
    await seedFinanceExtras(companyId);
    return;
  }

  await pool.query(
    "INSERT INTO companies (id, name, employee_count, pay_schedule) VALUES ($1, $2, $3, $4)",
    [companyId, "Harrow & Vale Property Group", 15, "Weekly + monthly"]
  );

  const runId = randomUUID();
  await pool.query(
    `INSERT INTO payroll_runs
      (id, company_id, period_label, pay_period, payday, bacs_cutoff_label, status, gross_pay, employer_ni, employer_pension, net_pay, connected_balance, mid_month_note)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $9, $10, $11, $12)`,
    [
      runId,
      companyId,
      "September 2026 payroll",
      "1–30 Sep",
      "Wed 30 Sep",
      "2d 6h",
      74680.4,
      6142.18,
      2893.55,
      58240.16,
      75000.0,
      "A preview run on the data fed in so far caught 2 issues early, including Jack Whitmore's bank details below — found with two weeks to fix it instead of at the deadline. This is the final review before payday.",
    ]
  );

  const lines: Array<{
    name: string;
    role: string;
    net: number;
    severity: string | null;
    source: string | null;
    tag: string | null;
    reason: string | null;
    delta: number | null;
  }> = [
    {
      name: "Jack Whitmore",
      role: "Lettings Coordinator",
      net: 1842.3,
      severity: "critical",
      source: "Bank & Payments",
      tag: "Blocking · payment will fail",
      reason:
        "Sort code failed live validation — this payment will bounce if submitted as-is. Confirm updated bank details before including him in this run.",
      delta: null,
    },
    {
      name: "Layla Bennett",
      role: "Junior Negotiator",
      net: 1678.44,
      severity: "serious",
      source: "Compliance",
      tag: "NMW proximity",
      reason:
        "Effective hourly rate £12.74 after her uniform deduction — 3p above the £12.71 NMW floor. Confirm the deduction timing is compliant before approving.",
      delta: null,
    },
    {
      name: "Ronke Okafor",
      role: "Sales Associate",
      net: 2104.9,
      severity: "warning",
      source: "Tax & Statutory",
      tag: "Variance · explained",
      reason:
        "Net pay is down 18% on last period because her Plan 2 student loan deduction started this month — first earnings threshold crossing, not a calculation error.",
      delta: -18,
    },
    {
      name: "Marcus Chen",
      role: "Senior Broker",
      net: 6340.18,
      severity: "warning",
      source: "Commission & Variable Pay",
      tag: "Commission split",
      reason:
        "£4,200.00 commission includes a 60/40 split with T. Ahmed on the Riverside Quarter lease — multi-agent split detected. Confirm the allocation before approving.",
      delta: null,
    },
    { name: "Priya Anand", role: "Office Manager", net: 2214.6, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Tomasz Nowak", role: "Senior Broker", net: 3880.05, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Grace Adeyemi", role: "Property Manager", net: 2540.32, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Sam O'Rourke", role: "Negotiator", net: 2190.18, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Farah Hussain", role: "Marketing Lead", net: 2760.9, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Ben Coates", role: "Viewings Coordinator", net: 1932.44, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Tariq Ahmed", role: "Negotiator", net: 2405.7, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Hannah Fischer", role: "Compliance Officer", net: 2875.0, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Owen Blake", role: "Maintenance Lead", net: 2108.6, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Nadia Petrov", role: "Accounts Assistant", net: 2050.15, severity: null, source: null, tag: null, reason: null, delta: null },
    { name: "Callum Reid", role: "Junior Negotiator", net: 1876.2, severity: null, source: null, tag: null, reason: null, delta: null },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    await pool.query(
      `INSERT INTO payroll_lines (id, run_id, employee_name, role, net_pay, severity, source, tag_label, reason, delta_pct, resolved, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11)`,
      [randomUUID(), runId, line.name, line.role, line.net, line.severity, line.source, line.tag, line.reason, line.delta, i]
    );
  }

  const auditEntries: Array<{ kind: string; message: string; detail: string; occurredAt: string }> = [
    { kind: "hmrc", message: "FPS accepted by HMRC", detail: "Correlation ID 8F2C-19A4-41B0", occurredAt: "Wed 27 Aug, 09:02" },
    { kind: "approval", message: "Approved by Aniket Sharma", detail: "2FA verified", occurredAt: "Wed 27 Aug, 16:42" },
    { kind: "approval", message: "Approved by Aniket Sharma", detail: "2FA verified", occurredAt: "Thu 24 Jul, 17:10" },
    { kind: "bacs", message: "BACS file submitted", detail: "Standard 18, 15 payments", occurredAt: "Thu 24 Jul, 15:58" },
  ];
  for (let i = 0; i < auditEntries.length; i++) {
    const e = auditEntries[i];
    await pool.query(
      `INSERT INTO audit_log (id, company_id, kind, message, detail, occurred_at, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), companyId, e.kind, e.message, e.detail, e.occurredAt, i]
    );
  }

  const trend: Array<{ month: string; cost: number; deals: number; headcount: number }> = [
    { month: "Apr", cost: 82140, deals: 100, headcount: 100 },
    { month: "May", cost: 81960, deals: 108, headcount: 100 },
    { month: "Jun", cost: 83010, deals: 96, headcount: 107 },
    { month: "Jul", cost: 82540, deals: 91, headcount: 107 },
    { month: "Aug", cost: 83290, deals: 84, headcount: 107 },
    { month: "Sep", cost: 83716.13, deals: 80, headcount: 107 },
  ];
  for (let i = 0; i < trend.length; i++) {
    const t = trend[i];
    await pool.query(
      `INSERT INTO cost_trend (id, company_id, month_label, cost_to_company, deals_index, headcount_index, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [randomUUID(), companyId, t.month, t.cost, t.deals, t.headcount, i]
    );
  }

  await pool.query(
    `INSERT INTO profitability_stats
      (company_id, bonus_budget, bonus_budget_note, optimum_role, optimum_salary_low, optimum_salary_high, optimum_salary_current, staffing_note, staffing_fte_delta, staffing_flag)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [companyId, 6240, "Q3 2026, after 15% margin buffer", "Junior Negotiator", 24000, 27500, 22600, "Viewings team vs current deal volume", 1.2, "Review before Nov"]
  );

  const recs = [
    "Reduce Viewings Coordinator hours by ~15% through the Nov–Jan seasonal low — frees roughly £2,100/month toward the bonus pool.",
    "The Junior Negotiator band sits £1,400–4,900 below the local market rate — a flight risk within two pay reviews if unaddressed.",
    "Q3 margin supports a £6,240 discretionary bonus pool without touching the 15% profitability buffer.",
  ];
  for (let i = 0; i < recs.length; i++) {
    await pool.query(`INSERT INTO recommendations (id, company_id, body, sort_order) VALUES ($1, $2, $3, $4)`, [
      randomUUID(),
      companyId,
      recs[i],
      i,
    ]);
  }

  await seedEmployeesAndIntegrations(companyId);
  await seedCloseTasks(companyId);
  await seedPriorRun(companyId);
  await seedLedger(companyId);
  await seedBusinessOps(companyId);
  await seedFinanceExtras(companyId);
}

function emailFor(name: string): string {
  const local = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .join(".");
  return `${local}@harrowvale.co.uk`;
}

/** Seeds the employees and integrations tables if they're empty for this company — safe to call whether the base seed just ran or ran in an earlier deploy. */
async function seedEmployeesAndIntegrations(companyId: string): Promise<void> {
  const pool = getPool();

  const existingEmployees = await pool.query("SELECT id FROM employees WHERE company_id = $1 LIMIT 1", [companyId]);
  if (!existingEmployees.rowCount) {
    const roster: Array<{
      name: string;
      role: string;
      employmentType: string;
      weeklyHours: number;
      startDate: string;
      taxCode: string;
      niNumber: string;
    }> = [
      { name: "Jack Whitmore", role: "Lettings Coordinator", employmentType: "Full-time", weeklyHours: 37.5, startDate: "3 Apr 2023", taxCode: "1257L W1", niNumber: "QQ 12 34 56 A" },
      { name: "Layla Bennett", role: "Junior Negotiator", employmentType: "Full-time", weeklyHours: 37.5, startDate: "14 Aug 2024", taxCode: "1257L", niNumber: "QQ 12 34 57 B" },
      { name: "Ronke Okafor", role: "Sales Associate", employmentType: "Full-time", weeklyHours: 37.5, startDate: "22 Jan 2022", taxCode: "1257L", niNumber: "QQ 12 34 58 C" },
      { name: "Marcus Chen", role: "Senior Broker", employmentType: "Full-time", weeklyHours: 37.5, startDate: "9 Jun 2019", taxCode: "1257L", niNumber: "QQ 12 34 59 D" },
      { name: "Priya Anand", role: "Office Manager", employmentType: "Full-time", weeklyHours: 37.5, startDate: "1 Mar 2018", taxCode: "1257L", niNumber: "QQ 12 34 60 E" },
      { name: "Tomasz Nowak", role: "Senior Broker", employmentType: "Full-time", weeklyHours: 37.5, startDate: "17 Oct 2020", taxCode: "1257L", niNumber: "QQ 12 34 61 F" },
      { name: "Grace Adeyemi", role: "Property Manager", employmentType: "Full-time", weeklyHours: 37.5, startDate: "5 Feb 2021", taxCode: "1257L", niNumber: "QQ 12 34 62 G" },
      { name: "Sam O'Rourke", role: "Negotiator", employmentType: "Full-time", weeklyHours: 37.5, startDate: "11 Nov 2023", taxCode: "1257L", niNumber: "QQ 12 34 63 H" },
      { name: "Farah Hussain", role: "Marketing Lead", employmentType: "Full-time", weeklyHours: 37.5, startDate: "3 Jul 2022", taxCode: "1257L", niNumber: "QQ 12 34 64 I" },
      { name: "Ben Coates", role: "Viewings Coordinator", employmentType: "Full-time", weeklyHours: 37.5, startDate: "20 Sep 2024", taxCode: "1257L", niNumber: "QQ 12 34 65 J" },
      { name: "Tariq Ahmed", role: "Negotiator", employmentType: "Full-time", weeklyHours: 37.5, startDate: "8 May 2021", taxCode: "1257L", niNumber: "QQ 12 34 66 K" },
      { name: "Hannah Fischer", role: "Compliance Officer", employmentType: "Full-time", weeklyHours: 37.5, startDate: "16 Jan 2020", taxCode: "1257L", niNumber: "QQ 12 34 67 L" },
      { name: "Owen Blake", role: "Maintenance Lead", employmentType: "Full-time", weeklyHours: 37.5, startDate: "29 Mar 2019", taxCode: "1257L", niNumber: "QQ 12 34 68 M" },
      { name: "Nadia Petrov", role: "Accounts Assistant", employmentType: "Part-time", weeklyHours: 22.5, startDate: "12 Dec 2023", taxCode: "1257L", niNumber: "QQ 12 34 69 N" },
      { name: "Callum Reid", role: "Junior Negotiator", employmentType: "Part-time", weeklyHours: 22.5, startDate: "6 Jun 2025", taxCode: "1257L", niNumber: "QQ 12 34 70 O" },
    ];

    const idByName = new Map<string, string>();
    for (let i = 0; i < roster.length; i++) {
      const e = roster[i];
      const id = randomUUID();
      idByName.set(e.name, id);
      await pool.query(
        `INSERT INTO employees (id, company_id, name, role, email, employment_type, start_date, tax_code, ni_number, weekly_hours, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [id, companyId, e.name, e.role, emailFor(e.name), e.employmentType, e.startDate, e.taxCode, e.niNumber, e.weeklyHours, i]
      );
    }

    // Backfill employee_id on whatever payroll_lines already exist for this company, matched by name.
    const runs = await pool.query("SELECT id FROM payroll_runs WHERE company_id = $1", [companyId]);
    for (const run of runs.rows) {
      for (const [name, employeeId] of idByName) {
        await pool.query("UPDATE payroll_lines SET employee_id = $1 WHERE run_id = $2 AND employee_name = $3", [
          employeeId,
          run.id,
          name,
        ]);
      }
    }
  }

  const existingIntegrations = await pool.query("SELECT id FROM integrations WHERE company_id = $1 LIMIT 1", [companyId]);
  if (!existingIntegrations.rowCount) {
    const integrations: Array<{ id: string; name: string; category: string; description: string; status: string; lastSyncedAt: string | null }> = [
      { id: "rotacloud", name: "RotaCloud", category: "Time & attendance", description: "Auto-maps rota exports into payroll hours every cycle.", status: "connected", lastSyncedAt: "Today, 06:12" },
      { id: "timetastic", name: "Timetastic", category: "Leave management", description: "Syncs approved leave so payroll reflects unpaid/statutory days automatically.", status: "not_connected", lastSyncedAt: null },
      { id: "openbanking", name: "Open Banking feed", category: "Bank & payments", description: "Reconciles BACS payments and expense receipts against the connected account.", status: "connected", lastSyncedAt: "Today, 05:47" },
      { id: "hmrc", name: "HMRC Government Gateway", category: "Compliance", description: "Direct RTI (FPS/EPS) submission on every payroll run.", status: "connected", lastSyncedAt: "27 Aug, 09:02" },
      { id: "nest", name: "NEST Pension", category: "Compliance", description: "Auto-enrolment and contribution submission for eligible employees.", status: "connected", lastSyncedAt: "27 Aug, 09:04" },
      { id: "xero", name: "Xero", category: "Accounting", description: "Posts payroll journals to your general ledger after each approved run.", status: "not_connected", lastSyncedAt: null },
    ];
    for (let i = 0; i < integrations.length; i++) {
      const ig = integrations[i];
      await pool.query(
        `INSERT INTO integrations (id, company_id, name, category, description, status, last_synced_at, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ig.id, companyId, ig.name, ig.category, ig.description, ig.status, ig.lastSyncedAt, i]
      );
    }
  }

  await seedOnboardingTasks(companyId);
}

const CLOSE_TASK_LABELS = [
  "Confirm RTI (FPS) filed for the current period",
  "Confirm NEST contributions submitted",
  "Clear all critical and serious flagged lines",
  "Export payroll register and compliance summary for the accountant",
  "Reconcile BACS payment file against the connected bank feed",
];

/** Seeds the month-end close checklist for a company if it doesn't have one yet. */
async function seedCloseTasks(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM close_tasks WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  for (let i = 0; i < CLOSE_TASK_LABELS.length; i++) {
    // First two are already done in this seeded demo run; the rest are outstanding.
    const done = i < 2 ? 1 : 0;
    await pool.query(
      `INSERT INTO close_tasks (id, company_id, label, done, sort_order) VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), companyId, CLOSE_TASK_LABELS[i], done, i]
    );
  }
}

/**
 * Net pay each employee actually took home on the prior (August 2026, already-approved)
 * run. Hand-set, not randomised, and deliberately identical to the September figure for
 * anyone with no real story this period — real payroll doesn't drift by a few pounds for
 * no reason, and the diff view is only useful if "unchanged" actually means unchanged.
 * The few employees who do differ tie back to a specific cause: Ronke Okafor's Plan 2
 * threshold crossing, Layla Bennett's new uniform deduction, and Marcus Chen/Tomasz
 * Nowak's commission swings (both Senior Brokers, so month-to-month variance is expected).
 * Jack Whitmore's pay is unchanged — his September exception is about his bank details
 * failing validation, not his pay — which is exactly the case the diff view needs to
 * handle: a flag can appear with zero pay delta.
 */
const PRIOR_RUN_NET_PAY: Record<string, number> = {
  "Jack Whitmore": 1842.3,
  "Layla Bennett": 1703.44,
  "Ronke Okafor": 2566.95,
  "Marcus Chen": 5120.0,
  "Priya Anand": 2214.6,
  "Tomasz Nowak": 3742.8,
  "Grace Adeyemi": 2540.32,
  "Sam O'Rourke": 2190.18,
  "Farah Hussain": 2760.9,
  "Ben Coates": 1932.44,
  "Tariq Ahmed": 2405.7,
  "Hannah Fischer": 2875.0,
  "Owen Blake": 2108.6,
  "Nadia Petrov": 2050.15,
  "Callum Reid": 1876.2,
};

/**
 * Seeds a prior, already-approved payroll run (and its per-employee lines) so the
 * run-diff/audit view (pillar T) has real history to compare the current run against
 * instead of a single-run demo. Safe to call on every request — only inserts once the
 * company has fewer than two runs, and only once employees exist to attach lines to.
 */
async function seedPriorRun(companyId: string): Promise<void> {
  const pool = getPool();
  const { rows: runCountRows } = await pool.query("SELECT COUNT(*) as n FROM payroll_runs WHERE company_id = $1", [
    companyId,
  ]);
  if (Number(runCountRows[0]?.n ?? 0) >= 2) return;

  const { rows: employees } = await pool.query(
    "SELECT id, name, role FROM employees WHERE company_id = $1 ORDER BY sort_order ASC",
    [companyId]
  );
  if (!employees.length) return; // employees haven't been seeded yet this pass — will backfill next request

  const runId = randomUUID();
  await pool.query(
    `INSERT INTO payroll_runs
      (id, company_id, period_label, pay_period, payday, bacs_cutoff_label, status, gross_pay, employer_ni, employer_pension, net_pay, connected_balance, mid_month_note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'approved', $7, $8, $9, $10, $11, $12, '2026-08-27T16:42:00Z')`,
    [
      runId,
      companyId,
      "August 2026 payroll",
      "1–31 Aug",
      "Thu 27 Aug",
      "0d",
      72860.1,
      5980.4,
      2815.2,
      56826.3,
      74200.0,
      null,
    ]
  );

  for (let i = 0; i < employees.length; i++) {
    const e = employees[i] as { id: string; name: string; role: string };
    const net = PRIOR_RUN_NET_PAY[e.name] ?? 2200;
    await pool.query(
      `INSERT INTO payroll_lines (id, run_id, employee_id, employee_name, role, net_pay, severity, source, tag_label, reason, delta_pct, resolved, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, NULL, NULL, 0, $7)`,
      [randomUUID(), runId, e.id, e.name, e.role, net, i]
    );
  }
}

const ONBOARDING_TASK_LABELS = ["Contract signed & returned", "Right-to-work check completed", "Bank details verified", "Tax code confirmed with HMRC starter checklist"];

/** Seeds a digital-onboarding checklist per employee if none exist yet (pillar O). Employees who started long enough ago are marked fully onboarded; recent starters are left with outstanding items so the feature has something real to show. */
async function seedOnboardingTasks(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query(
    `SELECT ot.id FROM onboarding_tasks ot JOIN employees e ON e.id = ot.employee_id WHERE e.company_id = $1 LIMIT 1`,
    [companyId]
  );
  if (existing.rowCount) return;

  const { rows: employees } = await pool.query(
    "SELECT id, start_date FROM employees WHERE company_id = $1 ORDER BY sort_order ASC",
    [companyId]
  );
  const referenceDate = new Date("2026-09-15");
  for (const emp of employees) {
    const started = new Date(emp.start_date as string);
    const daysEmployed = Number.isNaN(started.getTime())
      ? 9999
      : Math.floor((referenceDate.getTime() - started.getTime()) / (1000 * 60 * 60 * 24));
    // The two most recently started employees (< 400 days) still have open onboarding items.
    const fullyOnboarded = daysEmployed >= 400;
    for (let i = 0; i < ONBOARDING_TASK_LABELS.length; i++) {
      const done = fullyOnboarded || i === 0 ? 1 : 0;
      await pool.query(
        `INSERT INTO onboarding_tasks (id, employee_id, label, done, sort_order) VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), emp.id, ONBOARDING_TASK_LABELS[i], done, i]
      );
    }
  }
}

/**
 * Seeds Verity Ledger's demo data — a handful of sales invoices Harrow & Vale has raised
 * against landlord clients, and the connected bank feed those invoices get reconciled
 * against. Safe to call on every request — only inserts once, and only once a payroll run
 * exists to link the BACS debit line to (so the seeded feed shows the payroll run-diff
 * feature and Verity Ledger sharing the same underlying bank connection, not two disjoint
 * demos).
 */
async function seedLedger(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM invoices WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  const { rows: runRows } = await pool.query(
    "SELECT id FROM payroll_runs WHERE company_id = $1 ORDER BY created_at ASC LIMIT 1",
    [companyId]
  );
  const augustRunId = (runRows[0]?.id as string | undefined) ?? null;
  if (!augustRunId) return; // payroll history hasn't been seeded yet this pass — will backfill next request

  type SeedInvoice = {
    number: string;
    customerName: string;
    customerEmail: string;
    issueDate: string;
    dueDate: string;
    status: "draft" | "sent" | "paid";
    items: Array<{ description: string; quantity: number; unitPrice: number }>;
  };

  const invoices: SeedInvoice[] = [
    {
      number: "INV-1041",
      customerName: "Bellcourt Estates Ltd",
      customerEmail: "accounts@bellcourtestates.co.uk",
      issueDate: "1 Sep 2026",
      dueDate: "15 Sep 2026",
      status: "paid",
      items: [{ description: "Property management fee — September", quantity: 1, unitPrice: 3200.0 }],
    },
    {
      number: "INV-1042",
      customerName: "Kestrel Holdings",
      customerEmail: "finance@kestrelholdings.com",
      issueDate: "3 Sep 2026",
      dueDate: "17 Sep 2026",
      status: "sent",
      items: [{ description: "Letting fee — 14 Riverside Quarter", quantity: 1, unitPrice: 1850.0 }],
    },
    {
      number: "INV-1043",
      customerName: "Marlow & Co",
      customerEmail: "ap@marlowandco.co.uk",
      issueDate: "5 Sep 2026",
      dueDate: "10 Sep 2026", // already past — renders as overdue
      status: "sent",
      items: [{ description: "Quarterly inspection — 3 units", quantity: 3, unitPrice: 150.0 }],
    },
    {
      number: "INV-1044",
      customerName: "Thornfield Residential",
      customerEmail: "accounts@thornfieldresidential.co.uk",
      issueDate: "8 Sep 2026",
      dueDate: "22 Sep 2026",
      status: "draft",
      items: [{ description: "Property management fee — September", quantity: 1, unitPrice: 2100.0 }],
    },
    {
      number: "INV-1045",
      customerName: "Bellcourt Estates Ltd",
      customerEmail: "accounts@bellcourtestates.co.uk",
      issueDate: "10 Sep 2026",
      dueDate: "24 Sep 2026",
      status: "sent",
      items: [{ description: "Additional inspection — out of cycle", quantity: 1, unitPrice: 300.0 }],
    },
  ];

  const invoiceIdByNumber = new Map<string, string>();
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    const subtotal = inv.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const vatRate = 20;
    const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
    const total = Math.round((subtotal + vatAmount) * 100) / 100;
    const invoiceId = randomUUID();
    invoiceIdByNumber.set(inv.number, invoiceId);

    await pool.query(
      `INSERT INTO invoices (id, company_id, invoice_number, customer_name, customer_email, issue_date, due_date, status, subtotal, vat_rate, vat_amount, total, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [invoiceId, companyId, inv.number, inv.customerName, inv.customerEmail, inv.issueDate, inv.dueDate, inv.status, subtotal, vatRate, vatAmount, total, i]
    );

    for (let j = 0; j < inv.items.length; j++) {
      const it = inv.items[j];
      await pool.query(
        `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), invoiceId, it.description, it.quantity, it.unitPrice, it.quantity * it.unitPrice, j]
      );
    }
  }

  const paidInvoiceId = invoiceIdByNumber.get("INV-1041")!;

  type SeedTxn = {
    date: string;
    description: string;
    amount: number;
    direction: "credit" | "debit";
    category: string | null;
    status: "matched" | "unmatched";
    matchedInvoiceId: string | null;
    matchedPayrollRunId: string | null;
  };

  const transactions: SeedTxn[] = [
    {
      date: "27 Aug 2026",
      description: "BACS PAYROLL RUN — AUG 2026",
      amount: 56826.3,
      direction: "debit",
      category: "Payroll (BACS)",
      status: "matched",
      matchedInvoiceId: null,
      matchedPayrollRunId: augustRunId,
    },
    {
      date: "1 Sep 2026",
      description: "OFFICE RENT — HARROW HIGH ST",
      amount: 1450.0,
      direction: "debit",
      category: "Rent",
      status: "unmatched",
      matchedInvoiceId: null,
      matchedPayrollRunId: null,
    },
    {
      date: "2 Sep 2026",
      description: "FASTER PAYMENT — BELLCOURT ESTATES LTD",
      amount: 3840.0,
      direction: "credit",
      category: null,
      status: "matched",
      matchedInvoiceId: paidInvoiceId,
      matchedPayrollRunId: null,
    },
    {
      date: "5 Sep 2026",
      description: "ADOBE CREATIVE CLOUD",
      amount: 89.0,
      direction: "debit",
      category: "Software",
      status: "unmatched",
      matchedInvoiceId: null,
      matchedPayrollRunId: null,
    },
    {
      date: "12 Sep 2026",
      description: "FASTER PAYMENT — KESTREL HOLDINGS",
      amount: 2220.0,
      direction: "credit",
      category: null,
      status: "unmatched",
      matchedInvoiceId: null,
      matchedPayrollRunId: null,
    },
    {
      date: "15 Sep 2026",
      description: "TFL / FUEL",
      amount: 412.5,
      direction: "debit",
      category: "Travel & subsistence",
      status: "unmatched",
      matchedInvoiceId: null,
      matchedPayrollRunId: null,
    },
  ];

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    await pool.query(
      `INSERT INTO bank_transactions (id, company_id, txn_date, description, amount, direction, category, status, matched_invoice_id, matched_payroll_run_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [randomUUID(), companyId, t.date, t.description, t.amount, t.direction, t.category, t.status, t.matchedInvoiceId, t.matchedPayrollRunId, i]
    );
  }
}

/**
 * Seeds the "business ops" feature set added alongside Verity Ledger: Quotes, Bills,
 * Purchase Orders, Inventory, Expense Claims, Mileage Tracking and Projects. One function
 * per area, called from a single wrapper so seed()/the backfill branch only need one call.
 * Safe to call on every request — each sub-seed checks its own table before inserting.
 */
async function seedBusinessOps(companyId: string): Promise<void> {
  await seedQuotes(companyId);
  await seedBillsAndPurchaseOrders(companyId);
  await seedInventory(companyId);
  await seedExpenseClaims(companyId);
  await seedMileageClaims(companyId);
  await seedProjects(companyId);
}

async function seedQuotes(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM quotes WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  type SeedQuote = {
    number: string;
    customerName: string;
    customerEmail: string;
    issueDate: string;
    expiryDate: string;
    status: "draft" | "sent" | "accepted";
    items: Array<{ description: string; quantity: number; unitPrice: number }>;
  };

  const quotes: SeedQuote[] = [
    {
      number: "QUO-2001",
      customerName: "Ashford Living",
      customerEmail: "hello@ashfordliving.co.uk",
      issueDate: "12 Sep 2026",
      expiryDate: "26 Sep 2026",
      status: "sent",
      items: [{ description: "Full management service — 6 units", quantity: 1, unitPrice: 1800.0 }],
    },
    {
      number: "QUO-2002",
      customerName: "Bellcourt Estates Ltd",
      customerEmail: "accounts@bellcourtestates.co.uk",
      issueDate: "15 Sep 2026",
      expiryDate: "29 Sep 2026",
      status: "accepted",
      items: [{ description: "Tenant find only — 2 units", quantity: 1, unitPrice: 900.0 }],
    },
    {
      number: "QUO-2003",
      customerName: "Riverside Quarter MC",
      customerEmail: "directors@riversidequartermc.co.uk",
      issueDate: "18 Sep 2026",
      expiryDate: "2 Oct 2026",
      status: "draft",
      items: [{ description: "Block management — communal areas", quantity: 1, unitPrice: 2400.0 }],
    },
  ];

  for (let i = 0; i < quotes.length; i++) {
    const q = quotes[i];
    const subtotal = q.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
    const vatAmount = Math.round(subtotal * 0.2 * 100) / 100;
    const total = Math.round((subtotal + vatAmount) * 100) / 100;
    const quoteId = randomUUID();
    await pool.query(
      `INSERT INTO quotes (id, company_id, quote_number, customer_name, customer_email, issue_date, expiry_date, status, subtotal, vat_rate, vat_amount, total, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,20,$10,$11,$12)`,
      [quoteId, companyId, q.number, q.customerName, q.customerEmail, q.issueDate, q.expiryDate, q.status, subtotal, vatAmount, total, i]
    );
    for (let j = 0; j < q.items.length; j++) {
      const it = q.items[j];
      await pool.query(
        `INSERT INTO quote_items (id, quote_id, description, quantity, unit_price, amount, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [randomUUID(), quoteId, it.description, it.quantity, it.unitPrice, it.quantity * it.unitPrice, j]
      );
    }
  }
}

async function seedBillsAndPurchaseOrders(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM bills WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  // PO-4001 is seeded as already converted into BILL-3003, so the PO -> Bill flow has a
  // real example on load rather than only being demonstrable by clicking through it live.
  const po1Id = randomUUID();
  const bill3Id = randomUUID();
  const bill1Id = randomUUID();

  await pool.query(
    `INSERT INTO bills (id, company_id, bill_reference, supplier_name, category, bill_date, due_date, status, total, source_purchase_order_id, sort_order)
     VALUES ($1,$2,'BILL-3001','Rightmove','Marketing & portals','1 Sep 2026','15 Sep 2026','paid',480.00,NULL,0)`,
    [bill1Id, companyId]
  );
  // The paid bill above already left the account — reflected as a matched debit on the
  // same connected feed Verity Ledger's invoices reconcile against.
  await pool.query(
    `INSERT INTO bank_transactions (id, company_id, txn_date, description, amount, direction, category, status, matched_bill_id, sort_order)
     VALUES ($1,$2,'2 Sep 2026','RIGHTMOVE PORTAL SUBSCRIPTION',480.00,'debit','Marketing & portals','matched',$3,6)`,
    [randomUUID(), companyId, bill1Id]
  );
  await pool.query(
    `INSERT INTO bills (id, company_id, bill_reference, supplier_name, category, bill_date, due_date, status, total, source_purchase_order_id, sort_order)
     VALUES ($1,$2,'BILL-3002','Zoopla','Marketing & portals','1 Sep 2026','15 Sep 2026','unpaid',360.00,NULL,1)`,
    [randomUUID(), companyId]
  );
  await pool.query(
    `INSERT INTO bills (id, company_id, bill_reference, supplier_name, category, bill_date, due_date, status, total, source_purchase_order_id, sort_order)
     VALUES ($1,$2,'BILL-3003','Harrow Print & Signage','Signage & print','12 Sep 2026','26 Sep 2026','unpaid',210.00,$3,2)`,
    [bill3Id, companyId, po1Id]
  );

  await pool.query(
    `INSERT INTO purchase_orders (id, company_id, po_number, supplier_name, order_date, status, total, converted_bill_id, sort_order)
     VALUES ($1,$2,'PO-4001','Harrow Print & Signage','5 Sep 2026','converted_to_bill',210.00,$3,0)`,
    [po1Id, companyId, bill3Id]
  );
  await pool.query(
    `INSERT INTO purchase_order_items (id, po_id, description, quantity, unit_price, amount, sort_order) VALUES ($1,$2,'To Let / For Sale board printing — 70 boards',1,210.00,210.00,0)`,
    [randomUUID(), po1Id]
  );

  const po2Id = randomUUID();
  await pool.query(
    `INSERT INTO purchase_orders (id, company_id, po_number, supplier_name, order_date, status, total, converted_bill_id, sort_order)
     VALUES ($1,$2,'PO-4002','Officeworks Direct','16 Sep 2026','sent',340.00,NULL,1)`,
    [po2Id, companyId]
  );
  await pool.query(
    `INSERT INTO purchase_order_items (id, po_id, description, quantity, unit_price, amount, sort_order) VALUES ($1,$2,'Tenant welcome pack stationery — Q4 restock',1,340.00,340.00,0)`,
    [randomUUID(), po2Id]
  );
}

async function seedInventory(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM inventory_items WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  type SeedItem = { sku: string; name: string; category: string; qty: number; reorder: number; cost: number; movements: Array<{ change: number; reason: string; date: string }> };
  const items: SeedItem[] = [
    {
      sku: "TL-BOARD", name: "To Let board (correx, 600x450)", category: "Signage", qty: 34, reorder: 15, cost: 4.2,
      movements: [{ change: -12, reason: "Installed across Sep listings", date: "10 Sep 2026" }],
    },
    {
      sku: "FS-BOARD", name: "For Sale board (correx, 600x450)", category: "Signage", qty: 8, reorder: 15, cost: 4.8,
      movements: [{ change: -9, reason: "Installed across Sep listings", date: "10 Sep 2026" }],
    },
    {
      sku: "KEY-FOB", name: "Branded key fob", category: "Branded merchandise", qty: 210, reorder: 50, cost: 0.65,
      movements: [{ change: -40, reason: "New tenant welcome packs", date: "5 Sep 2026" }],
    },
    {
      sku: "WELCOME-PACK", name: "Tenant welcome pack", category: "Stationery", qty: 12, reorder: 20, cost: 3.1,
      movements: [{ change: -18, reason: "Distributed to new tenants", date: "8 Sep 2026" }],
    },
    {
      sku: "LOCKBOX", name: "Key safe / lockbox", category: "Equipment", qty: 6, reorder: 5, cost: 18.5,
      movements: [{ change: -3, reason: "Fitted at new managed properties", date: "14 Sep 2026" }],
    },
  ];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const itemId = randomUUID();
    await pool.query(
      `INSERT INTO inventory_items (id, company_id, sku, name, category, quantity_on_hand, reorder_level, unit_cost, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [itemId, companyId, it.sku, it.name, it.category, it.qty, it.reorder, it.cost, i]
    );
    for (let j = 0; j < it.movements.length; j++) {
      const m = it.movements[j];
      await pool.query(
        `INSERT INTO inventory_movements (id, item_id, change, reason, occurred_at, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
        [randomUUID(), itemId, m.change, m.reason, m.date, j]
      );
    }
  }
}

async function seedExpenseClaims(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM expense_claims WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  const { rows: employees } = await pool.query("SELECT id, name FROM employees WHERE company_id = $1", [companyId]);
  if (!employees.length) return;
  const idFor = (name: string) => (employees.find((e) => e.name === name) as { id: string } | undefined)?.id;

  const claims: Array<{ employeeName: string; description: string; category: string; amount: number; date: string; status: "submitted" | "approved" | "reimbursed" }> = [
    { employeeName: "Grace Adeyemi", description: "Client lunch — Bellcourt renewal meeting", category: "Client entertainment", amount: 68.4, date: "8 Sep 2026", status: "approved" },
    { employeeName: "Owen Blake", description: "Emergency boiler part — 14 Riverside Quarter", category: "Maintenance & repairs", amount: 142.0, date: "12 Sep 2026", status: "reimbursed" },
    { employeeName: "Farah Hussain", description: "Social media ad boost — September listings", category: "Marketing", amount: 250.0, date: "15 Sep 2026", status: "submitted" },
  ];

  for (let i = 0; i < claims.length; i++) {
    const c = claims[i];
    const employeeId = idFor(c.employeeName);
    if (!employeeId) continue;
    await pool.query(
      `INSERT INTO expense_claims (id, company_id, employee_id, description, category, amount, expense_date, status, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [randomUUID(), companyId, employeeId, c.description, c.category, c.amount, c.date, c.status, i]
    );
    if (c.status === "reimbursed") {
      await pool.query(
        `INSERT INTO bank_transactions (id, company_id, txn_date, description, amount, direction, category, status, sort_order)
         VALUES ($1,$2,$3,$4,$5,'debit','Expense reimbursement','unmatched',7)`,
        [randomUUID(), companyId, c.date, `EXPENSE REIMBURSEMENT — ${c.employeeName.toUpperCase()}`, c.amount]
      );
    }
  }
}

async function seedMileageClaims(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM mileage_claims WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  const { rows: employees } = await pool.query("SELECT id, name FROM employees WHERE company_id = $1", [companyId]);
  if (!employees.length) return;
  const idFor = (name: string) => (employees.find((e) => e.name === name) as { id: string } | undefined)?.id;

  const claims: Array<{ employeeName: string; date: string; from: string; to: string; miles: number; status: "submitted" | "approved" | "reimbursed" }> = [
    { employeeName: "Tomasz Nowak", date: "10 Sep 2026", from: "Harrow office", to: "Riverside Quarter viewings", miles: 18, status: "approved" },
    { employeeName: "Ben Coates", date: "14 Sep 2026", from: "Harrow office", to: "5-site viewing loop", miles: 42, status: "submitted" },
  ];

  const RATE = 0.45;
  for (let i = 0; i < claims.length; i++) {
    const c = claims[i];
    const employeeId = idFor(c.employeeName);
    if (!employeeId) continue;
    const amount = Math.round(c.miles * RATE * 100) / 100;
    await pool.query(
      `INSERT INTO mileage_claims (id, company_id, employee_id, trip_date, from_location, to_location, miles, rate_per_mile, amount, status, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [randomUUID(), companyId, employeeId, c.date, c.from, c.to, c.miles, RATE, amount, c.status, i]
    );
  }
}

async function seedProjects(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM projects WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  const { rows: employees } = await pool.query("SELECT id, name FROM employees WHERE company_id = $1", [companyId]);
  const idFor = (name: string) => (employees.find((e) => e.name === name) as { id: string } | undefined)?.id ?? null;

  type SeedProject = {
    name: string;
    client: string;
    status: "active" | "completed" | "on_hold";
    budget: number;
    startDate: string;
    entries: Array<{ employeeName: string; hours: number; date: string; note: string }>;
  };

  const projects: SeedProject[] = [
    {
      name: "Riverside Quarter Block Management Setup",
      client: "Riverside Quarter MC",
      status: "active",
      budget: 4500,
      startDate: "1 Aug 2026",
      entries: [
        { employeeName: "Hannah Fischer", hours: 6, date: "3 Sep 2026", note: "Compliance audit of communal areas" },
        { employeeName: "Priya Anand", hours: 4, date: "5 Sep 2026", note: "Contract setup & onboarding" },
        { employeeName: "Owen Blake", hours: 8, date: "8 Sep 2026", note: "Initial maintenance survey" },
      ],
    },
    {
      name: "Thornfield Residential Portfolio Onboarding",
      client: "Thornfield Residential",
      status: "active",
      budget: 1200,
      startDate: "1 Sep 2026",
      entries: [
        { employeeName: "Priya Anand", hours: 10, date: "6 Sep 2026", note: "Portfolio data migration" },
        { employeeName: "Hannah Fischer", hours: 8, date: "10 Sep 2026", note: "Compliance review — 12 units" },
      ],
    },
    {
      name: "Bellcourt Estates Annual Review",
      client: "Bellcourt Estates Ltd",
      status: "completed",
      budget: 600,
      startDate: "1 Jul 2026",
      entries: [{ employeeName: "Grace Adeyemi", hours: 14, date: "20 Jul 2026", note: "Full portfolio review & report" }],
    },
  ];

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const projectId = randomUUID();
    await pool.query(
      `INSERT INTO projects (id, company_id, name, client_name, status, budget, hourly_rate, start_date, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,45,$7,$8)`,
      [projectId, companyId, p.name, p.client, p.status, p.budget, p.startDate, i]
    );
    for (let j = 0; j < p.entries.length; j++) {
      const e = p.entries[j];
      await pool.query(
        `INSERT INTO project_time_entries (id, project_id, employee_id, employee_name, hours, entry_date, note, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [randomUUID(), projectId, idFor(e.employeeName), e.employeeName, e.hours, e.date, e.note, j]
      );
    }
  }
}

/** A small, clearly-illustrative FX rate table (to GBP) — real functionality (stored, computed, displayed) without wiring a live rates API, same honesty pattern as the rest of the demo's numbers. */
const FX_RATES_TO_GBP: Record<string, number> = { GBP: 1, USD: 0.79, EUR: 0.855, AED: 0.215 };

async function seedFinanceExtras(companyId: string): Promise<void> {
  await seedContacts(companyId);
  await seedFixedAssets(companyId);
  await seedBudgetLines(companyId);
  await seedMultiCurrencySamples(companyId);
}

async function seedContacts(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM contacts WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  // Names match the customer_name/supplier_name strings already used on invoices/quotes/
  // bills/POs — balances are computed by matching on name rather than a new FK column, to
  // avoid a riskier migration across four already-shipped tables for a demo-scale feature.
  const contacts: Array<{ name: string; type: "customer" | "supplier"; email: string }> = [
    { name: "Bellcourt Estates Ltd", type: "customer", email: "accounts@bellcourtestates.co.uk" },
    { name: "Kestrel Holdings", type: "customer", email: "finance@kestrelholdings.com" },
    { name: "Marlow & Co", type: "customer", email: "ap@marlowandco.co.uk" },
    { name: "Thornfield Residential", type: "customer", email: "accounts@thornfieldresidential.co.uk" },
    { name: "Ashford Living", type: "customer", email: "hello@ashfordliving.co.uk" },
    { name: "Riverside Quarter MC", type: "customer", email: "directors@riversidequartermc.co.uk" },
    { name: "Al Manara Investments", type: "customer", email: "finance@almanarainvestments.ae" },
    { name: "Rightmove", type: "supplier", email: "billing@rightmove.co.uk" },
    { name: "Zoopla", type: "supplier", email: "billing@zoopla.co.uk" },
    { name: "Harrow Print & Signage", type: "supplier", email: "orders@harrowprint.co.uk" },
    { name: "Officeworks Direct", type: "supplier", email: "sales@officeworksdirect.co.uk" },
    { name: "PropTech Europe GmbH", type: "supplier", email: "billing@proptecheurope.de" },
  ];

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    await pool.query(
      `INSERT INTO contacts (id, company_id, name, type, email, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
      [randomUUID(), companyId, c.name, c.type, c.email, i]
    );
  }
}

async function seedFixedAssets(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM fixed_assets WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  const assets: Array<{ name: string; category: string; date: string; cost: number; life: number }> = [
    { name: "Company vehicle — Ford Transit Connect (viewings)", category: "Vehicles", date: "1 Jan 2024", cost: 24000, life: 5 },
    { name: "Office IT — 15x laptops & monitors", category: "IT equipment", date: "1 Sep 2025", cost: 13500, life: 3 },
    { name: "Reception & office furniture", category: "Furniture & fixtures", date: "1 Mar 2022", cost: 8200, life: 7 },
    { name: "Office photocopier / printer", category: "Equipment", date: "1 Jun 2023", cost: 3600, life: 4 },
  ];
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    await pool.query(
      `INSERT INTO fixed_assets (id, company_id, name, category, purchase_date, purchase_cost, useful_life_years, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [randomUUID(), companyId, a.name, a.category, a.date, a.cost, a.life, i]
    );
  }
}

async function seedBudgetLines(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT id FROM budget_lines WHERE company_id = $1 LIMIT 1", [companyId]);
  if (existing.rowCount) return;

  const lines: Array<{ category: string; budgeted: number }> = [
    { category: "Marketing & portals", budgeted: 1200 },
    { category: "Signage & print", budgeted: 500 },
    { category: "Client entertainment", budgeted: 150 },
    { category: "Maintenance & repairs", budgeted: 300 },
    { category: "Marketing", budgeted: 200 }, // deliberately over — Farah's £250 ad-boost claim
    { category: "Travel & subsistence", budgeted: 400 }, // deliberately over — mileage + fuel
    { category: "Rent", budgeted: 1500 },
    { category: "Software", budgeted: 100 },
  ];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    await pool.query(
      `INSERT INTO budget_lines (id, company_id, category, period_label, budgeted_amount, sort_order) VALUES ($1,$2,$3,'Q3 2026',$4,$5)`,
      [randomUUID(), companyId, l.category, l.budgeted, i]
    );
  }
}

/** One real multi-currency invoice and one real multi-currency bill — enough to demonstrate the conversion math actually works, without inventing a full second currency ledger. */
async function seedMultiCurrencySamples(companyId: string): Promise<void> {
  const pool = getPool();
  const existing = await pool.query(
    "SELECT id FROM invoices WHERE company_id = $1 AND currency <> 'GBP' LIMIT 1",
    [companyId]
  );
  if (existing.rowCount) return;

  const usdRate = FX_RATES_TO_GBP.USD;
  const usdSubtotal = 3800.0;
  const usdVat = Math.round(usdSubtotal * 0.2 * 100) / 100;
  const usdOriginalTotal = Math.round((usdSubtotal + usdVat) * 100) / 100;
  const usdGbpTotal = Math.round(usdOriginalTotal * usdRate * 100) / 100;
  const { rows: countRows } = await pool.query("SELECT COUNT(*) as n FROM invoices WHERE company_id = $1", [companyId]);
  const invoiceNumber = 1041 + Number(countRows[0]?.n ?? 0);
  const usdInvoiceId = randomUUID();
  await pool.query(
    `INSERT INTO invoices (id, company_id, invoice_number, customer_name, customer_email, issue_date, due_date, status, subtotal, vat_rate, vat_amount, total, currency, fx_rate, original_total, sort_order)
     VALUES ($1,$2,$3,'Al Manara Investments','finance@almanarainvestments.ae','5 Sep 2026','19 Sep 2026','sent',$4,20,$5,$6,'USD',$7,$8,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM invoices WHERE company_id = $2))`,
    [usdInvoiceId, companyId, `INV-${invoiceNumber}`, usdSubtotal * usdRate, usdVat * usdRate, usdGbpTotal, usdRate, usdOriginalTotal]
  );
  await pool.query(
    `INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount, sort_order) VALUES ($1,$2,'Annual portfolio review — Dubai Marina units',1,$3,$3,0)`,
    [randomUUID(), usdInvoiceId, usdSubtotal]
  );

  const eurRate = FX_RATES_TO_GBP.EUR;
  const eurOriginalTotal = 450.0;
  const eurGbpTotal = Math.round(eurOriginalTotal * eurRate * 100) / 100;
  const { rows: billCountRows } = await pool.query("SELECT COUNT(*) as n FROM bills WHERE company_id = $1", [companyId]);
  const billNumber = 3001 + Number(billCountRows[0]?.n ?? 0);
  await pool.query(
    `INSERT INTO bills (id, company_id, bill_reference, supplier_name, category, bill_date, due_date, status, total, currency, fx_rate, original_total, sort_order)
     VALUES ($1,$2,$3,'PropTech Europe GmbH','Software','8 Sep 2026','22 Sep 2026','unpaid',$4,'EUR',$5,$6,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM bills WHERE company_id = $2))`,
    [randomUUID(), companyId, `BILL-${billNumber}`, eurGbpTotal, eurRate, eurOriginalTotal]
  );
}

/** Ensures the schema exists and the demo company is seeded. Safe to call on every request — idempotent, and only does real work once per cold start. */
export async function ready(): Promise<void> {
  if (!globalThis.__verityReady) {
    globalThis.__verityReady = createSchema().then(seed);
  }
  return globalThis.__verityReady;
}
