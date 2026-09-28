import Link from "next/link";
import { RecurringForm, RecurringRow, RemindButton } from "@/components/InvoicingHub";
import { emailConfigProblem } from "@/lib/email";
import { gbp } from "@/lib/format";
import { emailLog, getCompanyProfile, listRecurring, remindersDue } from "@/lib/invoicing/service";

export const dynamic = "force-dynamic";

const card = "rounded-[14px] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow)]";

export default async function InvoicingPage() {
  const [profile, recurring, reminders, log] = await Promise.all([getCompanyProfile(), listRecurring(), remindersDue(), emailLog()]);
  const emailProblem = emailConfigProblem();
  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Invoicing</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          Recurring invoices, payment reminders and every email sent — raise one-off invoices in{" "}
          <Link href="/dashboard/ledger" className="font-semibold text-[var(--accent-strong)]">
            Verity Ledger
          </Link>
          . Your business details for invoices are in{" "}
          <Link href="/dashboard/settings" className="font-semibold text-[var(--accent-strong)]">
            Settings
          </Link>
          .
        </div>
      </div>
      {emailProblem && <div className="mb-4 rounded-[10px] bg-[var(--warning-soft)] px-4 py-3 text-[12.5px] text-[var(--warning-ink)]">{emailProblem} PDFs and recurring invoices work meanwhile.</div>}

      <section className={`${card} mb-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-[13px]">
          <div>
            <h2 className="font-display text-[14.5px] font-semibold">Recurring invoices</h2>
            <div className="text-xs text-[var(--ink-muted)]">Raised automatically each morning — missed dates are caught up</div>
          </div>
        </div>
        <div className="px-[18px] py-3">
          <RecurringForm defaultDueDays={profile.payment_terms_days} />
        </div>
        {recurring.map((r) => (
          <RecurringRow key={r.id} r={r} />
        ))}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Reminders due</h2>
            <div className="text-xs text-[var(--ink-muted)]">
              {profile.reminders_enabled ? `Sent automatically ${profile.reminder_days.split(",").join(", ")} days after the due date` : "Automatic reminders are off"}
            </div>
          </div>
          {reminders.length === 0 ? (
            <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">Nothing to chase.</div>
          ) : (
            reminders.map((r) => (
              <div key={r.invoiceId} className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-[18px] py-2.5 text-[12.5px] last:border-b-0">
                <span>
                  <strong>{r.number}</strong> {r.customer} · {gbp(r.total)} · {r.daysOverdue} days overdue
                  {!r.email && <span className="text-[var(--critical-ink)]"> · no email address</span>}
                </span>
                <RemindButton invoiceId={r.invoiceId} step={r.step} disabled={!!emailProblem || !r.email} />
              </div>
            ))
          )}
        </section>
        <section className={card}>
          <div className="border-b border-[var(--border)] px-[18px] py-[13px]">
            <h2 className="font-display text-[14.5px] font-semibold">Email history</h2>
          </div>
          {log.length === 0 ? (
            <div className="px-[18px] py-4 text-[13px] text-[var(--ink-muted)]">No emails sent yet.</div>
          ) : (
            log.map((e) => (
              <div key={e.id} className="border-b border-[var(--border)] px-[18px] py-2 text-[12.5px] last:border-b-0">
                <span className="font-num text-[var(--ink-muted)]">{e.sent_at}</span> · {e.kind === "reminder" ? "Reminder" : "Invoice"} {e.invoice_number} to {e.recipient}{" "}
                <span style={{ color: e.status === "sent" ? "var(--good-ink)" : "var(--critical-ink)" }}>{e.status === "sent" ? "✓ sent" : `✕ ${e.error}`}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
