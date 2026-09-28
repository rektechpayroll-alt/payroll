import { SettingsForm } from "@/components/SettingsForm";
import { PayrollSettingsForm } from "@/components/PayrollSettingsForm";
import { CompanyProfileForm } from "@/components/InvoicingHub";
import { getCompanyProfile } from "@/lib/invoicing/service";
import { getPayrollSettings } from "@/lib/payroll/records";
import { getCompany } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const company = await getCompany();
  const payroll = await getPayrollSettings();
  const profile = await getCompanyProfile();

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Settings</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">Company details, approval rules, and notification preferences.</div>
      </div>
      <section className="mb-[18px] rounded-[14px] border border-[var(--border)] bg-[var(--surface)] px-[18px] py-4 shadow-[var(--shadow)]">
        <h2 className="mb-3 font-display text-[14.5px] font-semibold">Business details</h2>
        <CompanyProfileForm profile={profile} />
      </section>
      <SettingsForm company={company} />
      <PayrollSettingsForm settings={payroll} />
    </div>
  );
}
