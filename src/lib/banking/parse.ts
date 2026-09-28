/**
 * Bank statement parsing — CSV (any UK bank's export, columns detected automatically) and
 * OFX/QFX. Pure functions; amounts in pence, dates ISO. Anything we can't read confidently
 * is reported back rather than guessed.
 */

export type StatementLine = {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // pence; positive = money in, negative = money out
  balance: number | null; // pence, running balance after this line if the bank gives it
  fitId: string | null; // bank's own transaction id (OFX), when present
};

export type ColumnMapping = {
  date: number;
  description: number[];
  /** Either one signed amount column… */
  amount: number | null;
  /** …or separate money-in / money-out columns. */
  paidIn: number | null;
  paidOut: number | null;
  balance: number | null;
  /** Some banks mark direction in a separate column ("DR"/"CR", "Debit"/"Credit"). */
  direction: number | null;
};

export type ParseResult = {
  format: "csv" | "ofx";
  lines: StatementLine[];
  mapping: ColumnMapping | null;
  headers: string[];
  errors: string[];
};

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** UK bank dates: 05/09/2026, 5/9/26, 2026-09-05, 05-Sep-2026, 5 Sep 2026, 20260905. Day-first, never US. */
export function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/^"|"$/g, "");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return validDate(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s/-]([A-Za-z]{3,4})[a-z]*[\s/-](\d{2,4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return validDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  return null;
}

/** "£1,234.56", "-12.00", "(12.00)", "12.00 DR", "1 234,56"? no — UK only. Returns pence or null. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/^"|"$/g, "");
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/\s?(DR|D)$/i.test(s)) {
    negative = true;
    s = s.replace(/\s?(DR|D)$/i, "");
  } else if (/\s?(CR|C)$/i.test(s)) {
    s = s.replace(/\s?(CR|C)$/i, "");
  }
  s = s.replace(/[£$€,\s]/g, "").replace(/GBP/i, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -pence : pence;
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180-ish CSV: quoted fields, doubled quotes, commas/newlines inside quotes. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");

/** Finds the header row (banks sometimes put account details above it) and maps the columns. */
export function detectColumns(rows: string[][]): { headerRow: number; mapping: ColumnMapping } | null {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const h = rows[r].map(norm);
    const find = (...patterns: RegExp[]) => h.findIndex((x) => patterns.some((p) => p.test(x)));
    const date = find(/^(transaction|posting|posted|value|completed)?date$/, /^date/);
    if (date < 0) continue;
    const paidIn = find(/^(paidin|moneyin|credit(amount)?|credits|in|receipts)$/);
    const paidOut = find(/^(paidout|moneyout|debit(amount)?|debits|out|payments|withdrawals)$/);
    const amount = find(/^(amount|value|amountgbp|transactionamount|net|sum)$/, /^amount/);
    const balance = find(/^(balance|runningbalance|balancegbp)$/, /^balance/);
    const direction = find(/^(type|transactiontype|drcr|debitcredit|creditdebit)$/);
    const descCandidates = [
      find(/^(description|transactiondescription|narrative|details|memo)$/),
      find(/^(name|payee|counterparty|merchant|merchantname)$/),
      find(/^(reference|ref|notes)$/),
    ].filter((i) => i >= 0);
    if (!descCandidates.length) continue;
    if (amount < 0 && paidIn < 0 && paidOut < 0) continue;
    return {
      headerRow: r,
      mapping: {
        date,
        description: [...new Set(descCandidates)],
        amount: paidIn >= 0 || paidOut >= 0 ? null : amount,
        paidIn: paidIn >= 0 ? paidIn : null,
        paidOut: paidOut >= 0 ? paidOut : null,
        balance: balance >= 0 ? balance : null,
        direction: amount >= 0 && direction >= 0 ? direction : null,
      },
    };
  }
  return null;
}

/** Some banks (e.g. HSBC) export with no header: date, description, amount[, balance]. */
function headerlessMapping(rows: string[][]): ColumnMapping | null {
  const sample = rows.slice(0, 5);
  if (!sample.length) return null;
  const width = sample[0].length;
  if (width < 3) return null;
  const ok = sample.every((r) => parseDate(r[0]) && parseAmount(r[2]) !== null);
  if (!ok) return null;
  return { date: 0, description: [1], amount: 2, paidIn: null, paidOut: null, balance: width > 3 && sample.every((r) => parseAmount(r[3]) !== null) ? 3 : null, direction: null };
}

export function parseCsvStatement(text: string, override?: ColumnMapping): ParseResult {
  const rows = parseCsvRows(text);
  const errors: string[] = [];
  let mapping = override ?? null;
  let start = 0;
  let headers: string[] = [];
  if (!mapping) {
    const detected = detectColumns(rows);
    if (detected) {
      mapping = detected.mapping;
      start = detected.headerRow + 1;
      headers = rows[detected.headerRow];
    } else {
      mapping = headerlessMapping(rows);
      headers = rows[0]?.map((_, i) => `Column ${i + 1}`) ?? [];
    }
  } else {
    const detected = detectColumns(rows);
    start = detected ? detected.headerRow + 1 : 0;
    headers = detected ? rows[detected.headerRow] : [];
  }
  if (!mapping) return { format: "csv", lines: [], mapping: null, headers: rows[0] ?? [], errors: ["Couldn't find date, description and amount columns — choose them below."] };

  const lines: StatementLine[] = [];
  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    const cell = (i: number | null) => (i === null || i < 0 ? "" : (row[i] ?? "").trim());
    const date = parseDate(cell(mapping.date));
    if (!date) {
      // Footer lines ("Closing balance", totals) are skipped quietly; real rows with a bad date are reported.
      if (cell(mapping.date)) errors.push(`Row ${r + 1}: couldn't read the date "${cell(mapping.date)}".`);
      continue;
    }
    let amount: number | null;
    if (mapping.amount !== null) {
      amount = parseAmount(cell(mapping.amount));
      // Only whole direction words count — "Type" columns often hold codes like DPC or BGC instead.
      const dir = cell(mapping.direction).toLowerCase();
      if (amount !== null && /^(dr|debit|d|out|money out|payment|withdrawal)$/.test(dir)) amount = -Math.abs(amount);
      if (amount !== null && /^(cr|credit|c|in|money in|receipt|deposit)$/.test(dir)) amount = Math.abs(amount);
    } else {
      const inn = parseAmount(cell(mapping.paidIn)) ?? 0;
      const out = parseAmount(cell(mapping.paidOut)) ?? 0;
      amount = cell(mapping.paidIn) || cell(mapping.paidOut) ? Math.abs(inn) - Math.abs(out) : null;
    }
    if (amount === null) {
      errors.push(`Row ${r + 1}: couldn't read the amount.`);
      continue;
    }
    const description = mapping.description.map(cell).filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 200) || "(no description)";
    lines.push({ date, description, amount, balance: mapping.balance !== null ? parseAmount(cell(mapping.balance)) : null, fitId: null });
  }
  if (!lines.length && !errors.length) errors.push("No transactions found in this file.");
  return { format: "csv", lines, mapping, headers, errors };
}

// ---------------------------------------------------------------------------
// OFX / QFX (SGML 1.x or XML 2.x)
// ---------------------------------------------------------------------------

function ofxTag(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : null;
}

export function parseOfxStatement(text: string): ParseResult {
  const errors: string[] = [];
  const lines: StatementLine[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const date = parseDate((ofxTag(block, "DTPOSTED") ?? "").slice(0, 8));
    const amount = parseAmount(ofxTag(block, "TRNAMT") ?? "");
    if (!date || amount === null) {
      errors.push(`Skipped a transaction with an unreadable date or amount (${ofxTag(block, "FITID") ?? "no id"}).`);
      continue;
    }
    const name = ofxTag(block, "NAME") ?? "";
    const memo = ofxTag(block, "MEMO") ?? "";
    lines.push({
      date,
      description: [name, memo && memo !== name ? memo : ""].filter(Boolean).join(" · ").slice(0, 200) || "(no description)",
      amount,
      balance: null,
      fitId: ofxTag(block, "FITID"),
    });
  }
  // The statement's closing balance is on the LEDGERBAL aggregate.
  const ledger = text.split(/<LEDGERBAL>/i)[1];
  const closing = ledger ? parseAmount(ofxTag(ledger, "BALAMT") ?? "") : null;
  if (closing !== null && lines.length) {
    const latest = lines.reduce((a, b) => (b.date >= a.date ? b : a));
    latest.balance = closing;
  }
  if (!lines.length && !errors.length) errors.push("No transactions found in this file.");
  return { format: "ofx", lines, mapping: null, headers: [], errors };
}

export function parseStatement(filename: string, text: string, override?: ColumnMapping): ParseResult {
  if (/\.(ofx|qfx)$/i.test(filename) || /<OFX>/i.test(text.slice(0, 2000))) return parseOfxStatement(text);
  return parseCsvStatement(text, override);
}
