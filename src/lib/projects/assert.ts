import { getPool } from "@/lib/db";

export class ProjectError extends Error {}

/** Checks a project belongs to the business before a bill or claim is charged to it. */
export async function assertProject(companyId: string, projectId: string | null | undefined): Promise<string | null> {
  if (!projectId) return null;
  const { rowCount } = await getPool().query("SELECT 1 FROM projects WHERE id = $1 AND company_id = $2", [projectId, companyId]);
  if (!rowCount) throw new ProjectError("That project doesn't exist.");
  return projectId;
}
