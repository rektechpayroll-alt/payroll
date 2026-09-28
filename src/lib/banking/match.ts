/**
 * Reconciliation suggestions for a bank statement line. Pure: the caller supplies the
 * candidates (open invoices, unpaid bills, unpaid wages, payments already recorded in
 * Verity, bank rules). Money in pence; statement amounts are signed (+ in, − out).
 *
 * Confidence:
 *  - high:   amount matches exactly AND something in the description ties it to the
 *            candidate (invoice number, supplier name, payroll words, a rule), or it's a
 *            payment already recorded within 3 days
 *  - medium: amount matches exactly, nothing else to go on
 * Auto-reconcile only ever applies a single high-confidence suggestion.
 */

export type LineForMatching = { id: string; date: string; description: string; amount: number };

export type Candidates = {
  invoices: Array<{ id: string; number: string; customer: string; total: number }>;
  bills: Array<{ id: string; reference: string; supplier: string; total: number }>;
  payRuns: Array<{ id: string; label: string; netPay: number; payDate: string | null }>;
  recorded: Array<{ id: string; date: string; description: string; amount: number }>;
  rules: Array<{ id: string; contains: string; direction: "any" | "credit" | "debit"; accountCode: string; accountName: string }>;
};

export type Suggestion =
  | { kind: "invoice"; id: string; label: string; confidence: Confidence }
  | { kind: "bill"; id: string; label: string; confidence: Confidence }
  | { kind: "payroll"; id: string; label: string; confidence: Confidence }
  | { kind: "recorded"; id: string; label: string; confidence: Confidence }
  | { kind: "rule"; id: string; accountCode: string; label: string; confidence: Confidence };

export type Confidence = "high" | "medium";

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !["ltd", "limited", "the", "and", "plc", "llp", "co", "inc"].includes(w));

/** Does the statement text mention this name (any significant word of it) or reference? */
function mentions(description: string, ...needles: string[]): boolean {
  const hay = description.toLowerCase().replace(/[^a-z0-9]/g, " ");
  const hayCompact = hay.replace(/\s+/g, "");
  return needles.some((n) => {
    const digits = n.replace(/\D/g, "");
    if (digits.length >= 3 && hayCompact.includes(digits)) return true;
    const ws = words(n);
    return ws.length > 0 && ws.some((w) => hay.split(/\s+/).includes(w));
  });
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;
const rank = (c: Confidence) => (c === "high" ? 0 : 1);

export function suggestionsFor(line: LineForMatching, c: Candidates): Suggestion[] {
  const out: Suggestion[] = [];
  const credit = line.amount > 0;
  const size = Math.abs(line.amount);

  for (const r of c.recorded) {
    if (r.amount !== line.amount) continue;
    const gap = daysApart(r.date, line.date);
    if (gap > 7) continue;
    out.push({ kind: "recorded", id: r.id, label: `Already recorded: ${r.description} (${r.date})`, confidence: gap <= 3 ? "high" : "medium" });
  }
  if (credit) {
    for (const inv of c.invoices) {
      if (inv.total !== size) continue;
      out.push({
        kind: "invoice",
        id: inv.id,
        label: `Invoice ${inv.number} — ${inv.customer}`,
        confidence: mentions(line.description, inv.number, inv.customer) ? "high" : "medium",
      });
    }
  } else {
    for (const b of c.bills) {
      if (b.total !== size) continue;
      out.push({ kind: "bill", id: b.id, label: `Bill ${b.reference} — ${b.supplier}`, confidence: mentions(line.description, b.reference, b.supplier) ? "high" : "medium" });
    }
    for (const run of c.payRuns) {
      if (run.netPay !== size) continue;
      out.push({ kind: "payroll", id: run.id, label: `Wages — ${run.label}`, confidence: /salar|wage|payroll|bacs|pay run/i.test(line.description) ? "high" : "medium" });
    }
  }
  for (const rule of c.rules) {
    if (rule.direction === "credit" && !credit) continue;
    if (rule.direction === "debit" && credit) continue;
    if (!line.description.toLowerCase().includes(rule.contains.toLowerCase())) continue;
    out.push({ kind: "rule", id: rule.id, accountCode: rule.accountCode, label: `Rule "${rule.contains}" → ${rule.accountCode} ${rule.accountName}`, confidence: "high" });
  }
  return out.sort((a, b) => rank(a.confidence) - rank(b.confidence));
}

/** The one suggestion auto-reconcile may apply, or null if it's ambiguous or not confident. */
export function autoMatch(suggestions: Suggestion[]): Suggestion | null {
  const high = suggestions.filter((s) => s.confidence === "high");
  if (high.length !== 1) return null;
  // Two documents for the same amount (one high, one medium) is still ambiguous for anything but a rule.
  const sameKindMedium = suggestions.some((s) => s !== high[0] && s.kind !== "rule" && high[0].kind !== "rule");
  return sameKindMedium ? null : high[0];
}
