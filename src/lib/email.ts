/**
 * Outgoing email through Resend's HTTP API (no SDK). Configure RESEND_API_KEY and EMAIL_FROM
 * (a sender on a domain verified with Resend, e.g. "Verity <billing@yourdomain.co.uk>").
 */

export type Attachment = { filename: string; content: Uint8Array };

export function emailConfigProblem(): string | null {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return "Email isn't set up yet — add RESEND_API_KEY and EMAIL_FROM to send invoices and reminders.";
  return null;
}

export async function sendEmail(input: { to: string; subject: string; text: string; html: string; replyTo?: string | null; attachments?: Attachment[] }): Promise<{ id: string }> {
  const problem = emailConfigProblem();
  if (problem) throw new Error(problem);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      attachments: (input.attachments ?? []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64") })),
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Email not sent: ${data.message ?? data.name ?? `HTTP ${res.status}`}`);
  return { id: data.id };
}

export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
