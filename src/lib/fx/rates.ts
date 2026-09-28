import { getPool, ready } from "@/lib/db";
import { USD_PEGS, isCurrency } from "./currencies";

/**
 * Exchange rates from the European Central Bank's daily reference rates (published around
 * 16:00 CET on working days, free and public). Stored against the euro and crossed to sterling
 * when used. Shared by every business — rates are public data, not anyone's books.
 */

export class FxError extends Error {}

const ECB_DAILY = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const ECB_90_DAYS = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

export type EcbDay = { date: string; perEur: Record<string, number> };

export function parseEcbXml(xml: string): EcbDay[] {
  const days: EcbDay[] = [];
  const dayRe = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]\s*>([\s\S]*?)<\/Cube>\s*(?=<Cube\s+time=|<\/Cube>)/g;
  for (const m of xml.matchAll(dayRe)) {
    const perEur: Record<string, number> = {};
    for (const r of m[2].matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]\s*\/>/g)) perEur[r[1]] = Number(r[2]);
    if (Object.keys(perEur).length) days.push({ date: m[1], perEur });
  }
  return days;
}

/** Fetches the latest rates (the last 90 days if we have little history) and stores them. Returns days stored. */
export async function refreshRates(): Promise<number> {
  await ready();
  const pool = getPool();
  const { rows } = await pool.query("SELECT COUNT(DISTINCT rate_date)::int AS n FROM fx_rates");
  const url = rows[0].n >= 30 ? ECB_DAILY : ECB_90_DAYS;
  const res = await fetch(url, { headers: { Accept: "application/xml" } });
  if (!res.ok) throw new FxError(`The ECB rates feed returned ${res.status}.`);
  const days = parseEcbXml(await res.text());
  if (!days.length) throw new FxError("The ECB rates feed had no rates in it.");
  const flat = days.flatMap((d) => Object.entries(d.perEur).map(([currency, rate]) => ({ date: d.date, currency, rate })));
  // One statement for the lot — the 90-day history is a few thousand rows.
  await pool.query(
    `INSERT INTO fx_rates (rate_date, currency, per_eur)
     SELECT * FROM unnest($1::date[], $2::text[], $3::float8[])
     ON CONFLICT (rate_date, currency) DO UPDATE SET per_eur = EXCLUDED.per_eur`,
    [flat.map((f) => f.date), flat.map((f) => f.currency), flat.map((f) => f.rate)]
  );
  return days.length;
}

export type GbpRate = { currency: string; rate: number; date: string; source: string };

/** Rates for one currency against the euro on the latest publication day on or before `date`. */
async function perEur(currency: string, date: string): Promise<{ rate: number; date: string } | null> {
  if (currency === "EUR") return { rate: 1, date };
  const { rows } = await getPool().query(
    "SELECT per_eur, to_char(rate_date, 'YYYY-MM-DD') AS d FROM fx_rates WHERE currency = $1 AND rate_date <= $2 ORDER BY rate_date DESC LIMIT 1",
    [currency, date]
  );
  return rows[0] ? { rate: rows[0].per_eur, date: rows[0].d } : null;
}

/**
 * Pounds for one unit of `currency` on `date`, from the most recent ECB publication on or
 * before that day (weekends and holidays use the previous working day's rate). Rates up to a
 * week old are used as they are; older than that, a fresh set is fetched first.
 */
export async function gbpRate(currency: string, date: string): Promise<GbpRate> {
  await ready();
  if (currency === "GBP") return { currency, rate: 1, date, source: "—" };
  if (!isCurrency(currency)) throw new FxError(`${currency} isn't a currency Verity supports.`);
  const pegged = USD_PEGS[currency];
  const lookup = pegged ? "USD" : currency;

  const find = async () => {
    const [gbp, other] = await Promise.all([perEur("GBP", date), perEur(lookup, date)]);
    return gbp && other ? { gbp, other } : null;
  };
  let found = await find();
  const stale = !found || Date.parse(date) - Date.parse(found.gbp.date) > 7 * 86_400_000;
  if (stale) {
    try {
      await refreshRates();
      found = await find();
    } catch {
      // Keep whatever we had; with nothing at all, say so below.
    }
  }
  if (!found) throw new FxError(`No exchange rate for ${currency} on ${date} yet — try again shortly.`);
  // 1 unit = (GBP per EUR) / (units per EUR), with pegged currencies going via the dollar.
  const units = pegged ? found.other.rate * pegged : found.other.rate;
  const rate = Math.round((found.gbp.rate / units) * 1e6) / 1e6;
  return { currency, rate, date: found.gbp.date, source: pegged ? `ECB via USD peg (${pegged})` : "ECB reference rate" };
}

/** Today's rate for every supported currency, for the currencies page. */
export async function latestRates(): Promise<GbpRate[]> {
  await ready();
  const { rows } = await getPool().query("SELECT DISTINCT currency FROM fx_rates");
  const today = new Date().toISOString().slice(0, 10);
  const have = new Set(rows.map((r) => r.currency));
  const codes = [...have, "EUR", ...Object.keys(USD_PEGS)].filter((c, i, a) => a.indexOf(c) === i && c !== "GBP" && isCurrency(c));
  const out: GbpRate[] = [];
  for (const c of codes.sort()) {
    try {
      out.push(await gbpRate(c, today));
    } catch {
      // Currency missing from the feed today — leave it out rather than guess.
    }
  }
  return out;
}
