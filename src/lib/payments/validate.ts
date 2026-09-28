/** Checks and tidies bank details before they go into a payment file a bank will reject on any mistake. */

export const cleanSortCode = (s: string | null | undefined) => (s ?? "").replace(/[\s-]/g, "");
export const cleanAccount = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "");
export const cleanIban = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "").toUpperCase();
export const cleanBic = (s: string | null | undefined) => (s ?? "").replace(/\s/g, "").toUpperCase();

export const sortCodeOk = (s: string) => /^\d{6}$/.test(s);
export const accountOk = (s: string) => /^\d{8}$/.test(s);
export const bicOk = (s: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s);

/** IBAN lengths by country (the ones UK businesses most often pay; others are checked by checksum alone). */
const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24, FI: 18, FR: 27, GB: 22, GI: 23, GR: 27,
  HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SA: 24, SE: 24, SI: 19, SK: 24, TR: 26,
};

/** ISO 13616: right length for the country and mod-97 of the rearranged number is 1. */
export function ibanOk(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const expected = IBAN_LENGTHS[iban.slice(0, 2)];
  if (expected && iban.length !== expected) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

/**
 * The SEPA character set (a–z A–Z 0–9 / - ? : ( ) . , ' + space), which every ISO 20022 bank
 * accepts. Accents are folded ("Zoë" → "Zoe"); anything else becomes a space.
 */
export function sepaText(s: string, max: number): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "+")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
