/**
 * HMRC Transaction Engine — Document Submission Protocol.
 *
 *   submit (Qualifier=request)  → acknowledgement: CorrelationID + ResponseEndPoint + PollInterval
 *   poll   (Qualifier=poll)     → acknowledgement (still working) | response (accepted) | error
 *   delete (Function=delete)    → tidy the response off HMRC's servers once we've stored it
 *
 * Responses are parsed with targeted regexes: they're small, and we only need a handful of
 * fields, so no XML parser dependency.
 */

export type ProtocolResult = {
  qualifier: "acknowledgement" | "response" | "error" | "unknown";
  correlationId: string | null;
  endpoint: string | null;
  pollInterval: number | null;
  errors: Array<{ number: string | null; text: string; location: string | null }>;
  raw: string;
};

export type RtiEnvironment = { name: "test" | "live"; endpoint: string; gatewayTest: boolean; vendorId: string | null };

/** Where submissions go. Defaults to HMRC's External Test Service until live credentials are configured. */
export function rtiEnvironment(): RtiEnvironment {
  const live = process.env.HMRC_RTI_ENVIRONMENT === "live";
  return {
    name: live ? "live" : "test",
    endpoint: live ? "https://transaction-engine.tax.service.gov.uk/submission" : "https://test-transaction-engine.tax.service.gov.uk/submission",
    gatewayTest: !live,
    vendorId: process.env.HMRC_VENDOR_ID || null,
  };
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([^<]*)</(?:\\w+:)?${name}>`))?.[1] ?? null;

export function parseProtocolResponse(xml: string): ProtocolResult {
  const qualifier = (tag(xml, "Qualifier") ?? "unknown") as ProtocolResult["qualifier"];
  const endpointMatch = xml.match(/<(?:\w+:)?ResponseEndPoint(?:\s+PollInterval="(\d+)")?[^>]*>([^<]*)</);
  const errors: ProtocolResult["errors"] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?Error>([\s\S]*?)<\/(?:\w+:)?Error>/g)) {
    const text = tag(m[1], "Text");
    if (text) errors.push({ number: tag(m[1], "Number"), text: text.trim(), location: tag(m[1], "Location") });
  }
  return {
    qualifier: ["acknowledgement", "response", "error"].includes(qualifier) ? qualifier : "unknown",
    correlationId: tag(xml, "CorrelationID"),
    endpoint: endpointMatch?.[2]?.trim() || null,
    pollInterval: endpointMatch?.[1] ? Number(endpointMatch[1]) : null,
    errors,
    raw: xml,
  };
}

export async function postToHmrc(url: string, xml: string): Promise<ProtocolResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8" },
    body: xml,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  const parsed = parseProtocolResponse(text);
  if (!res.ok && parsed.qualifier === "unknown") {
    return { ...parsed, qualifier: "error", errors: [{ number: String(res.status), text: `HMRC returned HTTP ${res.status}`, location: null }] };
  }
  return parsed;
}
