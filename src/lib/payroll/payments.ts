/**
 * Payment files for paying net pay. Two formats:
 *  - CSV (name, sort code, account, amount, reference) — the common bulk-payment import
 *    most UK business banks accept (column order varies by bank; check theirs).
 *  - BACS Standard 18 credit records (100 characters each), for employers with a BACS
 *    Service User Number submitting through Bacstel-IP software or a bureau, which adds
 *    the submission labels. Only offered when the business has a SUN.
 */

export type Payee = { name: string; sortCode: string; accountNumber: string; amountPence: number; reference: string };

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function paymentsCsv(payees: Payee[]): string {
  const rows = [["Name", "Sort code", "Account number", "Amount", "Reference"]];
  for (const p of payees) {
    rows.push([p.name, p.sortCode.replace(/(\d{2})(\d{2})(\d{2})/, "$1-$2-$3"), p.accountNumber, (p.amountPence / 100).toFixed(2), p.reference]);
  }
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** BACS allows upper-case letters, digits, space and . / & - only. */
const bacsText = (v: string, len: number) =>
  v
    .toUpperCase()
    .replace(/[^A-Z0-9 ./&-]/g, " ")
    .slice(0, len)
    .padEnd(len, " ");

export function standard18(
  payees: Payee[],
  originator: { sortCode: string; accountNumber: string; name: string }
): string {
  const records = payees.map((p) => {
    const record =
      p.sortCode + // destination sort code (6)
      p.accountNumber + // destination account (8)
      "0" + // destination account type
      "99" + // transaction code: credit
      originator.sortCode + // originating sort code (6)
      originator.accountNumber + // originating account (8)
      "    " + // free format (4)
      String(p.amountPence).padStart(11, "0") + // amount in pence (11)
      bacsText(originator.name, 18) + // service user name
      bacsText(p.reference, 18) + // service user's reference
      bacsText(p.name, 18); // destination account name
    if (record.length !== 100) throw new Error("Standard 18 record must be 100 characters");
    return record;
  });
  return records.join("\r\n") + "\r\n";
}
