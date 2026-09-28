/**
 * Integration-test harness: runs the real query layer against a throwaway Postgres
 * (TEST_DATABASE_URL — never the live database) with the signed-in user swapped for a
 * test user the test controls. Only lib/tenant's Clerk lookup is replaced; every query,
 * scope check and transaction is the production code.
 *
 * In a test file:
 *   vi.mock("@/lib/tenant", async () => (await import("@/test/harness")).tenantMock());
 */

export const testUser = {
  userId: "user_test_a",
  email: "owner-a@example.test",
  name: "Test Owner",
  isAdmin: false,
  companyId: null as string | null,
};

export function signInAs(userId: string, companyId: string | null, isAdmin = false) {
  Object.assign(testUser, { userId, email: `${userId}@example.test`, name: userId, companyId, isAdmin });
}

export async function tenantMock() {
  const { getPool } = await import("@/lib/db");
  class NoCompanyError extends Error {}
  async function memberships() {
    const { rows } = await getPool().query(
      `SELECT m.company_id, c.name, m.role, c.is_demo FROM company_members m JOIN companies c ON c.id = m.company_id WHERE m.user_id = $1`,
      [testUser.userId]
    );
    return rows;
  }
  return {
    ACTIVE_COMPANY_COOKIE: "verity_company",
    NoCompanyError,
    getSession: async () => ({ ...testUser, memberships: await memberships(), viewingAsAdmin: false }),
    currentCompanyId: async () => {
      if (!testUser.companyId) throw new NoCompanyError();
      return testUser.companyId;
    },
    canAccessCompany: async (id: string) => testUser.isAdmin || (await memberships()).some((m: { company_id: string }) => m.company_id === id),
  };
}
