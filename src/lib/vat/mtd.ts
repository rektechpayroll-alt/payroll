import { getPool, ready } from "@/lib/db";
import { decryptJson, encryptJson, hasEncryptionKey } from "@/lib/secrets";
import { currentCompanyId, getSession } from "@/lib/tenant";
import { mtdReturnBody, type VatBoxes } from "./calc";
import { VatError } from "./returns";

/**
 * HMRC Making Tax Digital for VAT (API v1.0). User-restricted OAuth: the business signs in
 * to HMRC once and Verity keeps the tokens (encrypted) to read obligations and file returns.
 * Every call carries HMRC's fraud prevention headers for the WEB_APP_VIA_SERVER method.
 */

const SERVICE = "vat";
const SCOPES = "read:vat write:vat";

export function mtdEnvironment() {
  const production = process.env.HMRC_MTD_ENVIRONMENT === "production";
  return {
    name: production ? "production" : "sandbox",
    base: production ? "https://api.service.hmrc.gov.uk" : "https://test-api.service.hmrc.gov.uk",
    clientId: process.env.HMRC_MTD_CLIENT_ID || null,
    clientSecret: process.env.HMRC_MTD_CLIENT_SECRET || null,
  };
}

export function mtdConfigProblem(): string | null {
  const env = mtdEnvironment();
  if (!env.clientId || !env.clientSecret) return "Filing VAT with HMRC opens once Verity is registered on HMRC's Developer Hub (HMRC_MTD_CLIENT_ID / HMRC_MTD_CLIENT_SECRET).";
  if (!hasEncryptionKey()) return "INTEGRATIONS_ENCRYPTION_KEY is missing.";
  return null;
}

export const mtdRedirectUri = (origin: string) => `${origin}/api/vat/hmrc/callback`;

export function mtdAuthorizeUrl(origin: string, state: string): string {
  const env = mtdEnvironment();
  const q = new URLSearchParams({ response_type: "code", client_id: env.clientId!, scope: SCOPES, state, redirect_uri: mtdRedirectUri(origin) });
  return `${env.base}/oauth/authorize?${q}`;
}

type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

async function tokenCall(body: Record<string, string>): Promise<Tokens> {
  const env = mtdEnvironment();
  const res = await fetch(`${env.base}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.clientId!, client_secret: env.clientSecret!, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new VatError(`HMRC sign-in failed: ${data.error_description ?? data.error ?? res.status}`);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000 };
}

export async function completeMtdConnection(code: string, origin: string): Promise<void> {
  await ready();
  const tokens = await tokenCall({ grant_type: "authorization_code", code, redirect_uri: mtdRedirectUri(origin) });
  await getPool().query(
    `INSERT INTO hmrc_connections (company_id, service, secret_enc, connected_by) VALUES ($1, $2, $3, $4)
     ON CONFLICT (company_id, service) DO UPDATE SET secret_enc = $3, connected_by = $4, connected_at = now()`,
    [await currentCompanyId(), SERVICE, encryptJson(tokens), (await getSession()).email]
  );
}

export async function mtdConnected(): Promise<boolean> {
  await ready();
  const { rowCount } = await getPool().query("SELECT 1 FROM hmrc_connections WHERE company_id = $1 AND service = $2", [await currentCompanyId(), SERVICE]);
  return !!rowCount;
}

export async function disconnectMtd(): Promise<void> {
  await ready();
  await getPool().query("DELETE FROM hmrc_connections WHERE company_id = $1 AND service = $2", [await currentCompanyId(), SERVICE]);
}

async function accessToken(): Promise<string> {
  const companyId = await currentCompanyId();
  const { rows } = await getPool().query("SELECT secret_enc FROM hmrc_connections WHERE company_id = $1 AND service = $2", [companyId, SERVICE]);
  if (!rows[0]) throw new VatError("Connect to HMRC first.");
  let tokens = decryptJson<Tokens>(rows[0].secret_enc);
  if (tokens.expiresAt - 60_000 < Date.now()) {
    tokens = await tokenCall({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
    await getPool().query("UPDATE hmrc_connections SET secret_enc = $3 WHERE company_id = $1 AND service = $2", [companyId, SERVICE, encryptJson(tokens)]);
  }
  return tokens.accessToken;
}

/** What the browser tells us about the user's device, for the fraud prevention headers. */
export type ClientDeviceInfo = {
  deviceId: string;
  userAgent: string;
  timezone: string; // "UTC+01:00"
  screens: Array<{ width: number; height: number; scalingFactor: number; colourDepth: number }>;
  windowSize: { width: number; height: number };
};

const enc = (s: string) => encodeURIComponent(s);

/** HMRC fraud prevention headers, connection method WEB_APP_VIA_SERVER. */
export function fraudPreventionHeaders(
  device: ClientDeviceInfo,
  request: { clientIp: string | null; clientPort: string | null; vendorIp: string | null; forwarded: Array<{ by: string; for: string }> },
  userId: string
): Record<string, string> {
  const headers: Record<string, string> = {
    "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
    "Gov-Client-Browser-JS-User-Agent": device.userAgent,
    "Gov-Client-Device-ID": device.deviceId,
    "Gov-Client-Timezone": device.timezone,
    "Gov-Client-Screens": device.screens.map((s) => `width=${s.width}&height=${s.height}&scaling-factor=${s.scalingFactor}&colour-depth=${s.colourDepth}`).join(","),
    "Gov-Client-Window-Size": `width=${device.windowSize.width}&height=${device.windowSize.height}`,
    "Gov-Client-User-IDs": `verity=${enc(userId)}`,
    "Gov-Vendor-Product-Name": enc("Verity"),
    "Gov-Vendor-Version": `verity-web=${enc("1.0.0")}`,
    "Gov-Vendor-License-IDs": "",
  };
  if (request.clientIp) {
    headers["Gov-Client-Public-IP"] = request.clientIp;
    headers["Gov-Client-Public-IP-Timestamp"] = new Date().toISOString();
  }
  if (request.clientPort) headers["Gov-Client-Public-Port"] = request.clientPort;
  if (request.vendorIp) headers["Gov-Vendor-Public-IP"] = request.vendorIp;
  if (request.forwarded.length) headers["Gov-Vendor-Forwarded"] = request.forwarded.map((h) => `by=${enc(h.by)}&for=${enc(h.for)}`).join(",");
  for (const [k, v] of Object.entries(headers)) if (!v) delete headers[k];
  return headers;
}

async function hmrc(path: string, init: RequestInit, fraud: Record<string, string>) {
  const env = mtdEnvironment();
  const res = await fetch(`${env.base}${path}`, {
    ...init,
    headers: { Accept: "application/vnd.hmrc.1.0+json", Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...fraud, ...init.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errs = (data.errors ?? []).map((e: { message: string }) => e.message);
    throw new VatError(`HMRC: ${[data.message, ...errs].filter(Boolean).join(" ") || `HTTP ${res.status}`}`);
  }
  return { data, headers: res.headers };
}

export type Obligation = { periodKey: string; start: string; end: string; due: string; status: "O" | "F"; received?: string };

export async function fetchObligations(vrn: string, fraud: Record<string, string>, from: string, to: string): Promise<Obligation[]> {
  const { data } = await hmrc(`/organisations/vat/${vrn}/obligations?from=${from}&to=${to}`, { method: "GET" }, fraud);
  return data.obligations ?? [];
}

export async function submitVatReturn(vrn: string, periodKey: string, boxes: VatBoxes, fraud: Record<string, string>) {
  const { data, headers } = await hmrc(`/organisations/vat/${vrn}/returns`, { method: "POST", body: JSON.stringify(mtdReturnBody(periodKey, boxes)) }, fraud);
  return { data, receiptId: headers.get("Receipt-ID"), correlationId: headers.get("X-CorrelationId") };
}

/** Files a finalised return with HMRC and records the receipt. */
export async function fileVatReturn(
  returnId: string,
  periodKey: string,
  device: ClientDeviceInfo,
  request: Parameters<typeof fraudPreventionHeaders>[1]
): Promise<{ receiptId: string | null }> {
  await ready();
  const companyId = await currentCompanyId();
  const session = await getSession();
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT r.*, c.vat_number FROM vat_returns r JOIN companies c ON c.id = r.company_id WHERE r.id = $1 AND r.company_id = $2",
    [returnId, companyId]
  );
  const r = rows[0];
  if (!r) throw new VatError("VAT return not found.");
  if (r.status === "submitted") throw new VatError("This return has already been filed with HMRC.");
  if (!r.vat_number) throw new VatError("Add your VAT registration number in VAT settings.");
  if (!/^[A-Z0-9#]{4}$/.test(periodKey)) throw new VatError("Choose the HMRC period this return is for.");
  const p = (n: number) => Math.round(n * 100);
  const boxes: VatBoxes = { box1: p(r.box1), box2: p(r.box2), box3: p(r.box3), box4: p(r.box4), box5: p(r.box5), box6: p(r.box6), box7: p(r.box7), box8: p(r.box8), box9: p(r.box9), payable: r.box3 >= r.box4 };
  const result = await submitVatReturn(r.vat_number, periodKey, boxes, fraudPreventionHeaders(device, request, session.userId));
  await pool.query(
    "UPDATE vat_returns SET status = 'submitted', period_key = $2, hmrc_receipt = $3, hmrc_response = $4, submitted_at = now() WHERE id = $1",
    [returnId, periodKey, result.receiptId, JSON.stringify(result.data)]
  );
  return { receiptId: result.receiptId };
}
