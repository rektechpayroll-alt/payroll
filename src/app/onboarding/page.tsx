import Link from "next/link";
import { BusinessSetupForm } from "@/components/BusinessSetupForm";
import { getSession } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSession();
  const hasBusiness = session.memberships.length > 0;

  return (
    <div className="flex min-h-full items-center justify-center bg-[var(--surface-2)] px-4 py-12">
      <div className="w-full max-w-[460px] rounded-[16px] border border-[var(--border)] bg-[var(--surface)] p-7 shadow-[var(--shadow)] max-[480px]:p-5">
        <div className="mb-1 font-display text-[24px] font-semibold">
          {hasBusiness ? "Add another business" : `Welcome to Verity, ${session.name.split(" ")[0]}`}
        </div>
        <p className="mb-6 text-[13.5px] text-[var(--ink-secondary)]">
          Your business gets its own dashboard, books and payroll — nobody else can see its data.
        </p>
        <BusinessSetupForm />
        {hasBusiness && (
          <Link href="/dashboard" className="mt-4 block text-center text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)]">
            Back to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
