import { randomUUID } from "node:crypto";
import { backfillLedgers, getPool, ready, seedBlankCompany, seedSampleData } from "./db";
import { getSession } from "./tenant";
import type { PAY_SCHEDULES } from "./pay-schedules";

/** Business lifecycle — not scoped to the current business the way lib/queries.ts is. */

export { PAY_SCHEDULES } from "./pay-schedules";

export type NewBusinessInput = {
  name: string;
  paySchedule: (typeof PAY_SCHEDULES)[number];
  employeeCount: number;
  sampleData: boolean;
};

/** Creates a business owned by the signed-in user, with either an empty set of books or the sample data set. */
export async function createBusiness(input: NewBusinessInput): Promise<string> {
  await ready();
  const session = await getSession();
  const pool = getPool();
  const companyId = randomUUID();
  await pool.query(
    `INSERT INTO companies (id, name, employee_count, pay_schedule, created_by) VALUES ($1, $2, $3, $4, $5)`,
    [companyId, input.name, input.employeeCount, input.paySchedule, session.userId]
  );
  await pool.query(
    `INSERT INTO company_members (company_id, user_id, email, name, role) VALUES ($1, $2, $3, $4, 'owner')`,
    [companyId, session.userId, session.email, session.name]
  );
  if (input.sampleData) {
    await seedSampleData(companyId);
    await backfillLedgers(); // posts the sample invoices, bills, claims and assets into its books
  } else {
    await seedBlankCompany(companyId);
  }
  return companyId;
}

export type BusinessSummary = {
  id: string;
  name: string;
  is_demo: boolean;
  created_at: string;
  owner_email: string | null;
  member_count: number;
  employee_count: number;
  invoice_count: number;
};

/** Every business on the platform — platform admins only. */
export async function listAllBusinesses(): Promise<BusinessSummary[]> {
  await ready();
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Forbidden");
  const { rows } = await getPool().query(
    `SELECT c.id, c.name, c.is_demo, to_char(c.created_at, 'DD Mon YYYY') AS created_at,
            (SELECT m.email FROM company_members m WHERE m.company_id = c.id AND m.role = 'owner' ORDER BY m.created_at LIMIT 1) AS owner_email,
            (SELECT COUNT(*)::int FROM company_members m WHERE m.company_id = c.id) AS member_count,
            (SELECT COUNT(*)::int FROM employees e WHERE e.company_id = c.id) AS employee_count,
            (SELECT COUNT(*)::int FROM invoices i WHERE i.company_id = c.id) AS invoice_count
     FROM companies c ORDER BY c.is_demo DESC, c.created_at DESC`
  );
  return rows as BusinessSummary[];
}
