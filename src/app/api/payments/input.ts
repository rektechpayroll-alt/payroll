const opt = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** Reads a bank details form body; the service checks the details. */
export function bankInput(b: Record<string, unknown> | null) {
  return { accountName: opt(b?.accountName), sortCode: opt(b?.sortCode), accountNumber: opt(b?.accountNumber), iban: opt(b?.iban), bic: opt(b?.bic) };
}
