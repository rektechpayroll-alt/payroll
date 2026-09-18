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
}

/** Ensures the schema exists and the demo company is seeded. Safe to call on every request — idempotent, and only does real work once per cold start. */
export async function ready(): Promise<void> {
  if (!globalThis.__verityReady) {
    globalThis.__verityReady = createSchema().then(seed);
  }
  return globalThis.__verityReady;
}
