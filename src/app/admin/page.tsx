import Link from "next/link";
import { notFound } from "next/navigation";
import { OpenBusinessButton } from "@/components/OpenBusinessButton";
import { listAllBusinesses } from "@/lib/companies";
import { getSession } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  // Hide the page's existence from everyone except platform admins.
  if (!session.isAdmin) notFound();
  const businesses = await listAllBusinesses();
  const customers = businesses.filter((b) => !b.is_demo);

  return (
    <div className="mx-auto max-w-[1040px] px-8 pb-16 pt-8 max-[760px]:px-4">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold">Platform admin</h1>
          <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
            {customers.length} customer business{customers.length === 1 ? "" : "es"} · signed in as {session.email}
          </div>
        </div>
        <Link href="/dashboard" className="text-[12.5px] font-semibold text-[var(--ink-secondary)] hover:text-[var(--ink)]">
          Back to dashboard
        </Link>
      </div>

      <section className="overflow-hidden rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">
                <th className="px-[18px] py-2.5 font-semibold">Business</th>
                <th className="px-[18px] py-2.5 font-semibold">Owner</th>
                <th className="px-[18px] py-2.5 font-semibold">Created</th>
                <th className="px-[18px] py-2.5 text-right font-semibold">Users</th>
                <th className="px-[18px] py-2.5 text-right font-semibold">Employees</th>
                <th className="px-[18px] py-2.5 text-right font-semibold">Invoices</th>
                <th className="px-[18px] py-2.5" />
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b.id} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-[18px] py-2.5 font-semibold">
                    {b.name}
                    {b.is_demo && <span className="ml-2 text-[11px] font-medium text-[var(--ink-muted)]">Demo</span>}
                  </td>
                  <td className="px-[18px] py-2.5 text-[var(--ink-secondary)]">{b.owner_email ?? "—"}</td>
                  <td className="px-[18px] py-2.5 text-[var(--ink-secondary)]">{b.created_at}</td>
                  <td className="font-num px-[18px] py-2.5 text-right">{b.member_count}</td>
                  <td className="font-num px-[18px] py-2.5 text-right">{b.employee_count}</td>
                  <td className="font-num px-[18px] py-2.5 text-right">{b.invoice_count}</td>
                  <td className="px-[18px] py-2.5 text-right">
                    <OpenBusinessButton companyId={b.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
