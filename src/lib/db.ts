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

/** Ensures the schema exists and the demo company is seeded. Safe to call on every request — idempotent, and only does real work once per cold start. */
export async function ready(): Promise<void> {
  if (!globalThis.__verityReady) {
    globalThis.__verityReady = createSchema().then(seed);
  }
  return globalThis.__verityReady;
}
