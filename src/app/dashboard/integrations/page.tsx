import { IntegrationsGrid } from "@/components/IntegrationsGrid";
import { getCompany, getIntegrations } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const company = await getCompany();
  const integrations = await getIntegrations();
  const connectedCount = integrations.filter((i) => i.status === "connected").length;

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Integrations</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} · {connectedCount} of {integrations.length} connected
        </div>
      </div>
      <IntegrationsGrid integrations={integrations} />
    </div>
  );
}
