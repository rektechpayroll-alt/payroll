import { SettingsForm } from "@/components/SettingsForm";
import { getCompany } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const company = await getCompany();

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Settings</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">Company details, approval rules, and notification preferences.</div>
      </div>
      <SettingsForm company={company} />
    </div>
  );
}
