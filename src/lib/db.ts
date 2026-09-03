import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "verity.db");

declare global {
  // eslint-disable-next-line no-var
  var __verityDb: DatabaseSync | undefined;
}

function createSchema(db: DatabaseSync) {
  db.exec(`
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
      gross_pay REAL NOT NULL,
      employer_ni REAL NOT NULL,
      employer_pension REAL NOT NULL,
      net_pay REAL NOT NULL,
      connected_balance REAL NOT NULL,
      mid_month_note TEXT
    );

    CREATE TABLE IF NOT EXISTS payroll_lines (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      role TEXT NOT NULL,
      net_pay REAL NOT NULL,
      severity TEXT,
      source TEXT,
      tag_label TEXT,
      reason TEXT,
      delta_pct REAL,
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
      cost_to_company REAL NOT NULL,
      deals_index REAL NOT NULL,
      headcount_index REAL NOT NULL,
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
      bonus_budget REAL NOT NULL,
      bonus_budget_note TEXT NOT NULL,
      optimum_role TEXT NOT NULL,
      optimum_salary_low REAL NOT NULL,
      optimum_salary_high REAL NOT NULL,
      optimum_salary_current REAL NOT NULL,
      staffing_note TEXT NOT NULL,
      staffing_fte_delta REAL NOT NULL,
      staffing_flag TEXT NOT NULL
    );
  `);
}

function seed(db: DatabaseSync) {
  const companyId = "harrow-vale";
  const existing = db.prepare("SELECT id FROM companies WHERE id = ?").get(companyId);
  if (existing) return;

  db.prepare(
    "INSERT INTO companies (id, name, employee_count, pay_schedule) VALUES (?, ?, ?, ?)"
  ).run(companyId, "Harrow & Vale Property Group", 15, "Weekly + monthly");

  const runId = randomUUID();
  db.prepare(
    `INSERT INTO payroll_runs
      (id, company_id, period_label, pay_period, payday, bacs_cutoff_label, status, gross_pay, employer_ni, employer_pension, net_pay, connected_balance, mid_month_note)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`
  ).run(
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
    "A preview run on the data fed in so far caught 2 issues early, including Jack Whitmore's bank details below — found with two weeks to fix it instead of at the deadline. This is the final review before payday."
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

  const insertLine = db.prepare(
    `INSERT INTO payroll_lines (id, run_id, employee_name, role, net_pay, severity, source, tag_label, reason, delta_pct, resolved, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  );
  lines.forEach((line, i) => {
    insertLine.run(
      randomUUID(),
      runId,
      line.name,
      line.role,
      line.net,
      line.severity,
      line.source,
      line.tag,
      line.reason,
      line.delta,
      i
    );
  });

  const auditEntries: Array<{ kind: string; message: string; detail: string; occurredAt: string }> = [
    { kind: "hmrc", message: "FPS accepted by HMRC", detail: "Correlation ID 8F2C-19A4-41B0", occurredAt: "Wed 27 Aug, 09:02" },
    { kind: "approval", message: "Approved by Aniket Sharma", detail: "2FA verified", occurredAt: "Wed 27 Aug, 16:42" },
    { kind: "approval", message: "Approved by Aniket Sharma", detail: "2FA verified", occurredAt: "Thu 24 Jul, 17:10" },
    { kind: "bacs", message: "BACS file submitted", detail: "Standard 18, 15 payments", occurredAt: "Thu 24 Jul, 15:58" },
  ];
  const insertAudit = db.prepare(
    `INSERT INTO audit_log (id, company_id, kind, message, detail, occurred_at, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  auditEntries.forEach((e, i) => insertAudit.run(randomUUID(), companyId, e.kind, e.message, e.detail, e.occurredAt, i));

  const trend: Array<{ month: string; cost: number; deals: number; headcount: number }> = [
    { month: "Apr", cost: 82140, deals: 100, headcount: 100 },
    { month: "May", cost: 81960, deals: 108, headcount: 100 },
    { month: "Jun", cost: 83010, deals: 96, headcount: 107 },
    { month: "Jul", cost: 82540, deals: 91, headcount: 107 },
    { month: "Aug", cost: 83290, deals: 84, headcount: 107 },
    { month: "Sep", cost: 83716.13, deals: 80, headcount: 107 },
  ];
  const insertTrend = db.prepare(
    `INSERT INTO cost_trend (id, company_id, month_label, cost_to_company, deals_index, headcount_index, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  trend.forEach((t, i) => insertTrend.run(randomUUID(), companyId, t.month, t.cost, t.deals, t.headcount, i));

  db.prepare(
    `INSERT INTO profitability_stats
      (company_id, bonus_budget, bonus_budget_note, optimum_role, optimum_salary_low, optimum_salary_high, optimum_salary_current, staffing_note, staffing_fte_delta, staffing_flag)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    companyId,
    6240,
    "Q3 2026, after 15% margin buffer",
    "Junior Negotiator",
    24000,
    27500,
    22600,
    "Viewings team vs current deal volume",
    1.2,
    "Review before Nov"
  );

  const recs = [
    "Reduce Viewings Coordinator hours by ~15% through the Nov–Jan seasonal low — frees roughly £2,100/month toward the bonus pool.",
    "The Junior Negotiator band sits £1,400–4,900 below the local market rate — a flight risk within two pay reviews if unaddressed.",
    "Q3 margin supports a £6,240 discretionary bonus pool without touching the 15% profitability buffer.",
  ];
  const insertRec = db.prepare(
    `INSERT INTO recommendations (id, company_id, body, sort_order) VALUES (?, ?, ?, ?)`
  );
  recs.forEach((r, i) => insertRec.run(randomUUID(), companyId, r, i));
}

export function getDb(): DatabaseSync {
  if (!globalThis.__verityDb) {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    const db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL;");
    createSchema(db);
    seed(db);
    globalThis.__verityDb = db;
  }
  return globalThis.__verityDb;
}
