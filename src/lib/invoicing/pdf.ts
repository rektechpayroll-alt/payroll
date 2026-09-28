import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * A clean A4 invoice PDF. Uses the built-in Helvetica fonts (WinAnsi), so text is reduced to
 * characters they can draw — "£" is supported; anything outside Latin-1 is replaced.
 */

export type InvoicePdfData = {
  business: {
    name: string;
    addressLines: string[];
    email: string | null;
    phone: string | null;
    vatNumber: string | null;
    companyNumber: string | null;
    bank: { name: string | null; sortCode: string | null; accountNumber: string | null } | null;
  };
  invoice: {
    number: string;
    issueDate: string;
    dueDate: string;
    customerName: string;
    customerEmail: string | null;
    currency: string;
    vatRate: number;
    subtotal: number;
    vatAmount: number;
    total: number;
    notes: string | null;
    status: string;
  };
  items: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
};

const A4 = { w: 595.28, h: 841.89 };
const M = 48;
const ink = rgb(0.1, 0.12, 0.16);
const muted = rgb(0.42, 0.45, 0.5);
const line = rgb(0.86, 0.87, 0.9);

/** WinAnsi-safe text (Helvetica can't encode e.g. "—" consistently or non-Latin scripts). */
const safe = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

const symbols: Record<string, string> = { GBP: "£", USD: "$", EUR: "EUR ", AED: "AED " };
const money = (n: number, currency: string) =>
  `${symbols[currency] ?? `${currency} `}${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function text(page: PDFPage, s: string, x: number, y: number, font: PDFFont, size = 10, color = ink) {
  page.drawText(safe(s), { x, y, size, font, color });
}
function right(page: PDFPage, s: string, xRight: number, y: number, font: PDFFont, size = 10, color = ink) {
  const t = safe(s);
  page.drawText(t, { x: xRight - font.widthOfTextAtSize(t, size), y, size, font, color });
}
/** Wraps text to a width, returning the lines. */
function wrap(s: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(s).split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

export async function renderInvoicePdf(d: InvoicePdfData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${d.invoice.number}`);
  pdf.setAuthor(d.business.name);
  pdf.setCreator("Verity");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;

  // Header: business on the left, INVOICE on the right.
  text(page, d.business.name, M, y - 4, bold, 16);
  right(page, d.invoice.status === "paid" ? "INVOICE — PAID" : "INVOICE", A4.w - M, y - 4, bold, 16, d.invoice.status === "paid" ? rgb(0.1, 0.5, 0.2) : ink);
  y -= 24;
  for (const l of [...d.business.addressLines, d.business.email, d.business.phone].filter(Boolean) as string[]) {
    text(page, l, M, y, regular, 9, muted);
    y -= 12;
  }
  let ry = A4.h - M - 28;
  for (const [k, v] of [
    ["Invoice number", d.invoice.number],
    ["Issue date", d.invoice.issueDate],
    ["Due date", d.invoice.dueDate],
    ...(d.business.vatNumber ? [["VAT number", `GB${d.business.vatNumber}`]] : []),
  ] as Array<[string, string]>) {
    text(page, k, A4.w - M - 200, ry, regular, 9, muted);
    right(page, v, A4.w - M, ry, bold, 9);
    ry -= 13;
  }
  y = Math.min(y, ry) - 18;

  text(page, "Bill to", M, y, regular, 9, muted);
  y -= 13;
  text(page, d.invoice.customerName, M, y, bold, 11);
  y -= 13;
  if (d.invoice.customerEmail) {
    text(page, d.invoice.customerEmail, M, y, regular, 9, muted);
    y -= 13;
  }
  y -= 14;

  // Line items.
  const cols = { desc: M, qty: A4.w - M - 210, price: A4.w - M - 100, amount: A4.w - M };
  const header = () => {
    page.drawRectangle({ x: M, y: y - 6, width: A4.w - 2 * M, height: 20, color: rgb(0.96, 0.96, 0.97) });
    text(page, "Description", cols.desc + 6, y, bold, 9);
    right(page, "Qty", cols.qty, y, bold, 9);
    right(page, "Unit price", cols.price, y, bold, 9);
    right(page, "Amount", cols.amount - 6, y, bold, 9);
    y -= 22;
  };
  header();
  for (const it of d.items) {
    const lines = wrap(it.description, regular, 10, cols.qty - cols.desc - 60);
    if (y - lines.length * 13 < M + 160) {
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - M;
      header();
    }
    lines.forEach((l, i) => text(page, l, cols.desc + 6, y - i * 13, regular, 10));
    right(page, String(it.quantity), cols.qty, y, regular, 10);
    right(page, money(it.unitPrice, d.invoice.currency), cols.price, y, regular, 10);
    right(page, money(it.amount, d.invoice.currency), cols.amount - 6, y, regular, 10);
    y -= lines.length * 13 + 6;
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: A4.w - M, y: y + 2 }, thickness: 0.5, color: line });
    y -= 8;
  }

  // Totals.
  y -= 4;
  const totals: Array<[string, string, boolean]> = [
    ["Subtotal", money(d.invoice.subtotal, d.invoice.currency), false],
    [`VAT at ${d.invoice.vatRate}%`, money(d.invoice.vatAmount, d.invoice.currency), false],
    ["Total due", money(d.invoice.total, d.invoice.currency), true],
  ];
  for (const [k, v, strong] of totals) {
    text(page, k, A4.w - M - 200, y, strong ? bold : regular, strong ? 11 : 10);
    right(page, v, A4.w - M - 6, y, strong ? bold : regular, strong ? 11 : 10);
    y -= strong ? 18 : 14;
  }

  // Payment details and notes, anchored to the bottom.
  let by = M + 96;
  const bank = d.business.bank;
  if (bank?.sortCode && bank.accountNumber) {
    text(page, "How to pay", M, by, bold, 10);
    by -= 14;
    text(page, `Bank transfer to ${bank.name ?? d.business.name} · sort code ${bank.sortCode.replace(/(\d{2})(\d{2})(\d{2})/, "$1-$2-$3")} · account ${bank.accountNumber}`, M, by, regular, 9);
    by -= 12;
    text(page, `Please use ${d.invoice.number} as the payment reference.`, M, by, regular, 9, muted);
    by -= 18;
  }
  if (d.invoice.notes) {
    for (const l of wrap(d.invoice.notes, regular, 9, A4.w - 2 * M).slice(0, 3)) {
      text(page, l, M, by, regular, 9, muted);
      by -= 12;
    }
  }
  const footer = [d.business.name, d.business.companyNumber ? `Registered in England & Wales no. ${d.business.companyNumber}` : null].filter(Boolean).join(" · ");
  text(page, footer, M, M - 8, regular, 8, muted);
  return pdf.save();
}
