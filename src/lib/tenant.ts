import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { cookies } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { DEMO_COMPANY_ID, getPool, ready } from "./db";

/**
 * Multi-business accounts. Every signed-in user belongs to one or more businesses
 * (company_members); the one they're looking at is remembered in a cookie and
 * re-validated against their memberships on every request, so a stale or tampered
 * cookie can never open someone else's business.
 *
 * Platform admins (PLATFORM_ADMIN_EMAILS, comma-separated) can open any business.
 */

export const ACTIVE_COMPANY_COOKIE = "verity_company";

export type Membership = { company_id: string; name: string; role: "owner" | "member"; is_demo: boolean };

export type Session = {
  userId: string;
  email: string | null;
  name: string;
  isAdmin: boolean;
  memberships: Membership[];
  /** The business this request is scoped to, or null if the user hasn't set one up yet. */
  companyId: string | null;
  /** True when an admin is viewing a business they aren't a member of. */
  viewingAsAdmin: boolean;
};

export class NoCompanyError extends Error {
  constructor() {
    super("No business selected for this user");
  }
}

function adminEmails(): string[] {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function membershipsFor(userId: string): Promise<Membership[]> {
  const { rows } = await getPool().query(
    `SELECT m.company_id, c.name, m.role, c.is_demo
     FROM company_members m JOIN companies c ON c.id = m.company_id
     WHERE m.user_id = $1 ORDER BY c.is_demo ASC, m.created_at ASC`,
    [userId]
  );
  return rows as Membership[];
}

/**
 * Scheduled jobs (recurring invoices, reminders) have no signed-in user. They run each
 * business's work inside runAsCompany(), which scopes every query to that one business
 * exactly as a signed-in owner would be.
 */
const systemContext = new AsyncLocalStorage<{ companyId: string }>();

export function runAsCompany<T>(companyId: string, fn: () => Promise<T>): Promise<T> {
  return systemContext.run({ companyId }, fn);
}

/**
 * The session for this request. A scheduled job's business is checked *before* the per-request
 * cache: one job request works through many businesses, and must never reuse another's session.
 */
export async function getSession(): Promise<Session> {
  const system = systemContext.getStore();
  if (system) {
    return { userId: "system", email: null, name: "Verity (automatic)", isAdmin: false, memberships: [], companyId: system.companyId, viewingAsAdmin: false };
  }
  return userSession();
}

/** Resolved once per request (React cache), then shared by every query in that request. */
const userSession = cache(async (): Promise<Session> => {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  await ready();

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || email || "You";
  const isAdmin = !!email && adminEmails().includes(email);

  let memberships = await membershipsFor(userId);
  // Admins keep the demo business in their own list without having to be added to it.
  if (isAdmin && !memberships.some((m) => m.company_id === DEMO_COMPANY_ID)) {
    await getPool().query(
      `INSERT INTO company_members (company_id, user_id, email, name, role) VALUES ($1, $2, $3, $4, 'owner')
       ON CONFLICT DO NOTHING`,
      [DEMO_COMPANY_ID, userId, email, name]
    );
    memberships = await membershipsFor(userId);
  }

  const wanted = (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value ?? null;
  let companyId: string | null = null;
  let viewingAsAdmin = false;
  if (wanted && memberships.some((m) => m.company_id === wanted)) {
    companyId = wanted;
  } else if (wanted && isAdmin) {
    const { rowCount } = await getPool().query("SELECT 1 FROM companies WHERE id = $1", [wanted]);
    if (rowCount) {
      companyId = wanted;
      viewingAsAdmin = true;
    }
  }
  if (!companyId) {
    // Default to the user's own business before the shared demo.
    companyId = memberships[0]?.company_id ?? null;
  }

  return { userId, email, name, isAdmin, memberships, companyId, viewingAsAdmin };
});

/** The business every query in this request is scoped to. */
export async function currentCompanyId(): Promise<string> {
  const { companyId } = await getSession();
  if (!companyId) throw new NoCompanyError();
  return companyId;
}

/** Whether the signed-in user may open this business (member, or platform admin). */
export async function canAccessCompany(companyId: string): Promise<boolean> {
  const session = await getSession();
  if (session.memberships.some((m) => m.company_id === companyId)) return true;
  if (!session.isAdmin) return false;
  const { rowCount } = await getPool().query("SELECT 1 FROM companies WHERE id = $1", [companyId]);
  return !!rowCount;
}
