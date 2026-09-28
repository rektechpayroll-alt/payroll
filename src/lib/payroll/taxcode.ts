import type { TaxRegime } from "./rates";

export type ParsedTaxCode =
  | { kind: "allowance"; regime: TaxRegime; number: number; letter: string; nonCumulative: boolean; code: string } // e.g. 1257L, S1257L, 0T
  | { kind: "K"; regime: TaxRegime; number: number; nonCumulative: boolean; code: string } // e.g. K475, SK475
  | { kind: "BR"; regime: TaxRegime; nonCumulative: boolean; code: string }
  | { kind: "D"; regime: TaxRegime; index: number; nonCumulative: boolean; code: string } // D0, D1, SD2…
  | { kind: "NT"; regime: TaxRegime; nonCumulative: boolean; code: string };

/** The code as HMRC's FPS wants it: no S/C prefix, no W1/M1/X suffix (e.g. "1257L", "K475", "BR"). */
export function fpsTaxCode(code: ParsedTaxCode): string {
  switch (code.kind) {
    case "allowance":
      return code.number === 0 ? "0T" : `${code.number}${code.letter}`;
    case "K":
      return `K${code.number}`;
    case "D":
      return `D${code.index}`;
    default:
      return code.kind;
  }
}

/**
 * Parses a UK tax code as issued by HMRC: optional S/C (Scotland/Wales) prefix, the code
 * itself, and an optional W1 / M1 / X suffix meaning "operate on a non-cumulative basis".
 * Returns null for anything that isn't a valid code, so callers can flag it rather than guess.
 */
export function parseTaxCode(raw: string): ParsedTaxCode | null {
  let code = raw.toUpperCase().replace(/\s+/g, "");
  if (!code) return null;

  let nonCumulative = false;
  const suffix = code.match(/(W1|M1|X)$/);
  // "X" alone could never be a whole code, and a trailing X after digits+letter is the suffix.
  if (suffix && code.length > suffix[1].length) {
    nonCumulative = true;
    code = code.slice(0, -suffix[1].length);
  }

  // NT has no Scottish/Welsh variant.
  if (code === "NT") return { kind: "NT", regime: "rUK", nonCumulative, code: raw.toUpperCase().trim() };

  let regime: TaxRegime = "rUK";
  if (code.startsWith("S")) {
    regime = "scotland";
    code = code.slice(1);
  } else if (code.startsWith("C")) {
    regime = "wales";
    code = code.slice(1);
  }
  const display = raw.toUpperCase().trim();

  if (code === "BR") return { kind: "BR", regime, nonCumulative, code: display };
  let m = code.match(/^D(\d)$/);
  if (m) return { kind: "D", regime, index: Number(m[1]), nonCumulative, code: display };
  m = code.match(/^K(\d{1,6})$/);
  if (m) return { kind: "K", regime, number: Number(m[1]), nonCumulative, code: display };
  m = code.match(/^(\d{1,6})([LMNPTY])$/);
  if (m) return { kind: "allowance", regime, number: Number(m[1]), letter: m[2], nonCumulative, code: display };
  return null;
}
