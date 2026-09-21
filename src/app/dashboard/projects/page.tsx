import { getCompany, getEmployees, getProjects, getProjectTimeEntries } from "@/lib/queries";
import { ProjectsHub } from "@/components/ProjectsHub";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const company = await getCompany();
  const [employees, projects] = await Promise.all([getEmployees(), getProjects()]);
  const projectsWithEntries = await Promise.all(
    projects.map(async (p) => ({ ...p, entries: await getProjectTimeEntries(p.id) }))
  );

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Projects</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} &middot; client work tracked against a budget — logged hours convert to cost at each project&rsquo;s
          hourly rate, the same &ldquo;budget headroom&rdquo; idea the Profitability page already applies to payroll.
        </div>
      </div>

      <ProjectsHub employees={employees} initialProjects={projectsWithEntries} />
    </div>
  );
}
