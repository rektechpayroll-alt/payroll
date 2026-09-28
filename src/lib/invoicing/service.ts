import { randomUUID } from "node:crypto";
import { getPool, ready } from "@/lib/db";
import { emailConfigProblem, escapeHtml, sendEmail } from "@/lib/email";
import { ledgerDate } from "@/lib/ledger/posting";
import { createInvoice, getInvoiceById, getInvoiceItems, updateInvoiceStatus, type Invoice } from "@/lib/queries";
import { currentCompanyId, runAsCompany } from "@/lib/tenant";
import { renderInvoicePdf } from "./pdf";

/** Invoice PDFs, emailing, payment reminders and recurring invoices. */

export class InvoicingError extends Error {}

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const emailOk = (s: string | null | undefined) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export type CompanyProfile = {
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  contact_email: string | null;
  phone: string | null;
  company_number: string | null;
  payment_terms_days: number;
  reminders_enabled: boolean;
  reminder_days: string;
};

export async function getCompanyProfile(): Promise<CompanyProfile> {
  await ready();
  const { rows } = await getPool().query(
    "SELECT name, address_line1, address_line2, city, postcode, contact_email, phone, company_number, payment_terms_days, reminders_enabled, reminder_days FROM companies WHERE id = $1",
    [await currentCompanyId()]
  );
  return rows[0] as CompanyProfile;
}

export async function updateCompanyProfile(p: Omit<CompanyProfile, "name"> & { name: string }): Promise<void> {
  await ready();
  const name = p.name.trim();
  if (name.length < 2) throw new InvoicingError("Enter your business name.");
  if (p.contact_email && !emailOk(p.contact_email)) throw new InvoicingError("That email address doesn't look right.");
  if (!(p.payment_terms_days >= 0 && p.payment_terms_days <= 365)) throw new InvoicingError("Payment terms must be 0–365 days.");
  const steps = p.reminder_days
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 365);
  if (p.reminders_enabled && !steps.length) throw new InvoicingError("Add at least one reminder day, e.g. 1, 7, 14, 30.");
  const c = p.company_number?.trim().toUpperCase() || null;
  if (c && !/^([0-9]{8}|[A-Z]{2}[0-9]{6})$/.test(c)) throw new InvoicingError("A Companies House number is 8 characters, e.g. 12345678 or SC123456.");
  await getPool().query(
    `UPDATE companies SET name = $1, address_line1 = $2, address_line2 = $3, city = $4, postcode = $5, contact_email = $6, phone = $7,
       company_number = $8, payment_terms_days = $9, reminders_enabled = $10, reminder_days = $11 WHERE id = $12`,
    [
      name,
      p.address_line1?.trim() || null,
      p.address_line2?.trim() || null,
      p.city?.trim() || null,
      p.postcode?.trim().toUpperCase() || null,
      p.contact_email?.trim() || null,
      p.phone?.trim() || null,
      c,
      p.payment_terms_days,
      p.reminders_enabled,
      [...new Set(steps)].sort((a, b) => a - b).join(","),
      await currentCompanyId(),
    ]
  );
}

export async function invoicePdf(invoiceId: string): Promise<{ bytes: Uint8Array; invoice: Invoice }> {
  await ready();
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice) throw new InvoicingError("Invoice not found.");
  const items = await getInvoiceItems(invoiceId);
  const { rows } = await getPool().query("SELECT * FROM companies WHERE id = $1", [await currentCompanyId()]);
  const c = rows[0];
  // Line items are stored in the invoice's own currency; totals are stored in GBP (see createInvoice).
  const inCurrency = (gbp: number) => (invoice.currency === "GBP" || !invoice.fx_rate ? gbp : Math.round((gbp / invoice.fx_rate) * 100) / 100);
  const bytes = await renderInvoicePdf({
    business: {
      name: c.name,
      addressLines: [c.address_line1, c.address_line2, [c.city, c.postcode].filter(Boolean).join(" ")].filter(Boolean),
      email: c.contact_email,
      phone: c.phone,
      vatNumber: c.vat_registered ? c.vat_number : null,
      companyNumber: c.company_number,
      bank: c.bank_sort_code || c.iban ? { name: c.bank_account_name, sortCode: c.bank_sort_code, accountNumber: c.bank_account_number, iban: c.iban, bic: c.bic } : null,
    },
    invoice: {
      number: invoice.invoice_number,
      issueDate: ledgerDate(invoice.issue_date),
      dueDate: ledgerDate(invoice.due_date),
      customerName: invoice.customer_name,
      customerEmail: invoice.customer_email,
      currency: invoice.currency,
      vatRate: invoice.vat_rate,
      subtotal: inCurrency(invoice.subtotal),
      vatAmount: inCurrency(invoice.vat_amount),
      total: invoice.original_total ?? invoice.total,
      notes: invoice.notes,
      status: invoice.status,
    },
    items: items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unit_price, amount: i.amount })),
  });
  return { bytes, invoice };
}

async function logEmail(invoiceId: string, kind: "invoice" | "reminder", step: number | null, recipient: string, status: "sent" | "failed", error: string | null, providerId: string | null) {
  await getPool().query(
    `INSERT INTO invoice_emails (id, company_id, invoice_id, kind, reminder_step, recipient, status, error, provider_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
    [randomUUID(), await currentCompanyId(), invoiceId, kind, step, recipient, status, error, providerId]
  );
}

function invoiceEmailBody(invoice: Invoice, businessName: string, reminder: { daysOverdue: number } | null) {
  const value = invoice.currency !== "GBP" && invoice.original_total != null ? invoice.original_total : invoice.total;
  const amount = `${invoice.currency === "GBP" ? "£" : `${invoice.currency} `}${value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const due = ledgerDate(invoice.due_date);
  const intro = reminder
    ? reminder.daysOverdue > 0
      ? `This is a reminder that invoice ${invoice.invoice_number} for ${amount} was due on ${due} and is now ${reminder.daysOverdue} day${reminder.daysOverdue === 1 ? "" : "s"} overdue.`
      : `A friendly reminder that invoice ${invoice.invoice_number} for ${amount} is due today (${due}).`
    : `Please find attached invoice ${invoice.invoice_number} for ${amount}, due by ${due}.`;
  const text = `Hello ${invoice.customer_name},\n\n${intro}\n\nIf you've already paid, thank you — please ignore this email.\n\n${businessName}`;
  const html = `<p>Hello ${escapeHtml(invoice.customer_name)},</p><p>${escapeHtml(intro)}</p><p>If you've already paid, thank you — please ignore this email.</p><p>${escapeHtml(businessName)}</p>`;
  return { text, html };
}

/** Emails the invoice PDF to the customer. A draft is marked as sent (and so posted to the books). */
export async function emailInvoice(invoiceId: string, toOverride?: string): Promise<void> {
  const problem = emailConfigProblem();
  if (problem) throw new InvoicingError(problem);
  const existing = await getInvoiceById(invoiceId);
  if (!existing) throw new InvoicingError("Invoice not found.");
  if (existing.status === "void") throw new InvoicingError("Void invoices can't be sent.");
  const to = toOverride?.trim() || existing.customer_email;
  if (!emailOk(to)) throw new InvoicingError("Add the customer's email address to send this invoice.");
  if (existing.status === "draft") await updateInvoiceStatus(invoiceId, "sent");
  const { bytes, invoice } = await invoicePdf(invoiceId);
  const profile = await getCompanyProfile();
  const body = invoiceEmailBody(invoice, profile.name, null);
  try {
    const res = await sendEmail({
      to: to!,
      subject: `Invoice ${invoice.invoice_number} from ${profile.name}`,
      ...body,
      replyTo: profile.contact_email,
      attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: bytes }],
    });
    await logEmail(invoiceId, "invoice", null, to!, "sent", null, res.id);
  } catch (e) {
    await logEmail(invoiceId, "invoice", null, to!, "failed", e instanceof Error ? e.message : String(e), null);
    throw new InvoicingError(e instanceof Error ? e.message : "Email failed.");
  }
}

export type ReminderDue = { invoiceId: string; number: string; customer: string; email: string | null; total: number; dueDate: string; daysOverdue: number; step: number };

/** Unpaid invoices whose next reminder is due. Only the latest applicable step is sent, and only once. */
export async function remindersDue(asOf = today()): Promise<ReminderDue[]> {
  await ready();
  const companyId = await currentCompanyId();
  const { rows: c } = await getPool().query("SELECT reminders_enabled, reminder_days FROM companies WHERE id = $1", [companyId]);
  if (!c[0]?.reminders_enabled) return [];
  const steps = String(c[0].reminder_days).split(",").map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const { rows } = await getPool().query(
    `SELECT i.id, i.invoice_number, i.customer_name, i.customer_email, i.total, i.due_date,
            COALESCE((SELECT array_agg(reminder_step) FROM invoice_emails e WHERE e.invoice_id = i.id AND e.kind = 'reminder' AND e.status = 'sent'), '{}') AS sent_steps
     FROM invoices i WHERE i.company_id = $1 AND i.status = 'sent'`,
    [companyId]
  );
  const out: ReminderDue[] = [];
  for (const r of rows) {
    const due = ledgerDate(r.due_date);
    const overdue = daysBetween(due, asOf);
    const step = [...steps].reverse().find((s) => overdue >= s);
    if (step === undefined || (r.sent_steps as number[]).some((s) => s >= step)) continue;
    out.push({ invoiceId: r.id, number: r.invoice_number, customer: r.customer_name, email: r.customer_email, total: r.total, dueDate: due, daysOverdue: overdue, step });
  }
  return out;
}

export async function sendReminder(invoiceId: string, step: number, asOf = today()): Promise<void> {
  const problem = emailConfigProblem();
  if (problem) throw new InvoicingError(problem);
  const { bytes, invoice } = await invoicePdf(invoiceId);
  if (invoice.status !== "sent") throw new InvoicingError("Only unpaid invoices get reminders.");
  if (!emailOk(invoice.customer_email)) throw new InvoicingError(`Invoice ${invoice.invoice_number} has no customer email address.`);
  const profile = await getCompanyProfile();
  const body = invoiceEmailBody(invoice, profile.name, { daysOverdue: daysBetween(ledgerDate(invoice.due_date), asOf) });
  try {
    const res = await sendEmail({
      to: invoice.customer_email!,
      subject: `Reminder: invoice ${invoice.invoice_number} from ${profile.name}`,
      ...body,
      replyTo: profile.contact_email,
      attachments: [{ filename: `${invoice.invoice_number}.pdf`, content: bytes }],
    });
    await logEmail(invoiceId, "reminder", step, invoice.customer_email!, "sent", null, res.id);
  } catch (e) {
    await logEmail(invoiceId, "reminder", step, invoice.customer_email!, "failed", e instanceof Error ? e.message : String(e), null);
    throw new InvoicingError(e instanceof Error ? e.message : "Email failed.");
  }
}

export async function emailLog(invoiceId?: string) {
  await ready();
  const { rows } = await getPool().query(
    `SELECT e.id, e.kind, e.reminder_step, e.recipient, e.status, e.error, i.invoice_number,
            to_char(e.sent_at AT TIME ZONE 'Europe/London', 'DD Mon YYYY, HH24:MI') AS sent_at
     FROM invoice_emails e JOIN invoices i ON i.id = e.invoice_id
     WHERE e.company_id = $1 AND ($2::text IS NULL OR e.invoice_id = $2) ORDER BY e.sent_at DESC LIMIT 100`,
    [await currentCompanyId(), invoiceId ?? null]
  );
  return rows as Array<{ id: string; kind: string; reminder_step: number | null; recipient: string; status: string; error: string | null; invoice_number: string; sent_at: string }>;
}

// ---------------------------------------------------------------------------
// Recurring invoices
// ---------------------------------------------------------------------------

export type Frequency = "weekly" | "monthly" | "quarterly" | "yearly";
export type RecurringInvoice = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
  vat_rate: number;
  currency: string;
  frequency: Frequency;
  next_date: string;
  end_date: string | null;
  due_days: number;
  auto_send: boolean;
  active: boolean;
  notes: string | null;
};

/** The next date in a schedule. Monthly dates stick to the same day, clamped to short months (31 Jan → 28 Feb → 31 Mar). */
export function advance(date: string, frequency: Frequency, anchorDay = Number(date.slice(8, 10))): string {
  if (frequency === "weekly") return addDays(date, 7);
  const months = frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12;
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7)) - 1 + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(anchorDay, last))).toISOString().slice(0, 10);
}

export async function listRecurring(): Promise<RecurringInvoice[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT id, customer_name, customer_email, items, vat_rate, currency, frequency, to_char(next_date, 'YYYY-MM-DD') AS next_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date, due_days, auto_send, active, notes
     FROM recurring_invoices WHERE company_id = $1 ORDER BY created_at DESC`,
    [await currentCompanyId()]
  );
  return rows as RecurringInvoice[];
}

export async function createRecurring(input: Omit<RecurringInvoice, "id" | "active">): Promise<string> {
  await ready();
  if (!input.customer_name.trim()) throw new InvoicingError("Enter the customer's name.");
  if (!input.items.length || input.items.some((i) => !i.description.trim() || !(i.quantity > 0) || !(i.unitPrice >= 0))) throw new InvoicingError("Add at least one line with a description, quantity and price.");
  if (!["weekly", "monthly", "quarterly", "yearly"].includes(input.frequency)) throw new InvoicingError("Choose how often to invoice.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.next_date)) throw new InvoicingError("Choose the date of the first invoice.");
  if (input.end_date && input.end_date < input.next_date) throw new InvoicingError("The end date must be after the first invoice.");
  if (input.customer_email && !emailOk(input.customer_email)) throw new InvoicingError("That email address doesn't look right.");
  if (input.auto_send && !input.customer_email) throw new InvoicingError("Add the customer's email to send invoices automatically.");
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO recurring_invoices (id, company_id, customer_name, customer_email, items, vat_rate, currency, frequency, next_date, end_date, due_days, auto_send, notes, anchor_day)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [id, await currentCompanyId(), input.customer_name.trim(), input.customer_email || null, JSON.stringify(input.items), input.vat_rate, input.currency, input.frequency, input.next_date, input.end_date, input.due_days, input.auto_send, input.notes, Number(input.next_date.slice(8, 10))]
  );
  return id;
}

export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  await ready();
  const { rowCount } = await getPool().query("UPDATE recurring_invoices SET active = $2 WHERE id = $1 AND company_id = $3", [id, active, await currentCompanyId()]);
  if (!rowCount) throw new InvoicingError("Recurring invoice not found.");
}

export async function deleteRecurring(id: string): Promise<void> {
  await ready();
  await getPool().query("DELETE FROM recurring_invoices WHERE id = $1 AND company_id = $2", [id, await currentCompanyId()]);
}

/** Raises every recurring invoice due by `asOf` (catching up missed ones, at most 12 per template). */
export async function generateRecurring(asOf = today()): Promise<{ created: number; emailed: number; errors: string[] }> {
  await ready();
  const companyId = await currentCompanyId();
  const errors: string[] = [];
  let created = 0;
  let emailed = 0;
  const { rows } = await getPool().query(
    `SELECT id FROM recurring_invoices WHERE company_id = $1 AND active AND next_date <= $2 AND (end_date IS NULL OR next_date <= end_date)`,
    [companyId, asOf]
  );
  for (const { id } of rows) {
    // Claim this occurrence atomically so two overlapping runs can't both raise it.
    for (let n = 0; n < 12; n++) {
      const { rows: claim } = await getPool().query(
        `SELECT *, to_char(next_date, 'YYYY-MM-DD') AS nd, to_char(end_date, 'YYYY-MM-DD') AS ed FROM recurring_invoices
         WHERE id = $1 AND company_id = $2 AND active AND next_date <= $3 AND (end_date IS NULL OR next_date <= end_date)`,
        [id, companyId, asOf]
      );
      const t = claim[0];
      if (!t) break;
      const next = advance(t.nd, t.frequency, t.anchor_day ?? undefined);
      const moved = await getPool().query("UPDATE recurring_invoices SET next_date = $3 WHERE id = $1 AND next_date = $2", [id, t.nd, next]);
      if (!moved.rowCount) break; // another run took it
      const invoice = await createInvoice({
        customerName: t.customer_name,
        customerEmail: t.customer_email,
        issueDate: t.nd,
        dueDate: addDays(t.nd, t.due_days),
        vatRate: t.vat_rate,
        notes: t.notes,
        currency: t.currency,
        items: t.items,
      });
      await getPool().query("UPDATE invoices SET recurring_id = $2 WHERE id = $1", [invoice.id, id]);
      created++;
      if (t.auto_send) {
        try {
          if (emailConfigProblem()) await updateInvoiceStatus(invoice.id, "sent");
          else {
            await emailInvoice(invoice.id);
            emailed++;
          }
        } catch (e) {
          errors.push(`${invoice.invoice_number}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
  }
  return { created, emailed, errors };
}

/** The daily job: recurring invoices and reminders for every business. */
export async function runDailyJobs(asOf = today()) {
  await ready();
  const { rows } = await getPool().query("SELECT id FROM companies");
  const summary: Array<{ companyId: string; created: number; emailed: number; reminders: number; errors: string[] }> = [];
  for (const { id } of rows) {
    const result = await runAsCompany(id, async () => {
      const r = await generateRecurring(asOf);
      let reminders = 0;
      if (!emailConfigProblem()) {
        for (const due of await remindersDue(asOf)) {
          if (!due.email) continue;
          try {
            await sendReminder(due.invoiceId, due.step, asOf);
            reminders++;
          } catch (e) {
            r.errors.push(`Reminder ${due.number}: ${e instanceof Error ? e.message : e}`);
          }
        }
      }
      return { companyId: id, created: r.created, emailed: r.emailed, reminders, errors: r.errors };
    });
    summary.push(result);
  }
  return summary;
}
