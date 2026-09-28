import { createHash } from "node:crypto";
import { el, serialize, type XmlNode } from "./xml";

/**
 * GovTalk envelope + IRmark for HMRC's Transaction Engine (Document Submission Protocol).
 *
 * IRmark (HMRC "IRmark Generation Step By Step Guide"): take <Body>, give it the envelope's
 * namespace declaration, remove the <IRmark> element, canonicalise (C14N), SHA-1, Base64.
 * Our XML is built canonical with no whitespace, so the serialised Body *is* the C14N form.
 */

export const GOVTALK_NAMESPACE = "http://www.govtalk.gov.uk/CM/envelope";

export type RtiKind = "FPS" | "EPS";

export type GovTalkOptions = {
  kind: RtiKind;
  /** Test-in-Live: validated by HMRC as live but not processed onto records. */
  testInLive: boolean;
  /** GatewayTest=1 on HMRC's External Test Service. */
  gatewayTest: boolean;
  senderId: string;
  password: string;
  vendorId: string;
  product: string;
  version: string;
  /** Test service only: validate as if submitted at this time. */
  timestamp?: string;
};

type Document = { namespace: string; keys: { officeNo: string; payeRef: string }; relatedTaxYear: string; body: XmlNode };

/** Tax year "26-27" ends 5 April 2027. */
const periodEnd = (relatedTaxYear: string) => `20${relatedTaxYear.slice(3, 5)}-04-05`;

function irEnvelope(doc: Document, irmark: string | null): XmlNode {
  return el("IRenvelope", { xmlns: doc.namespace }, [
    el("IRheader", [
      el("Keys", [el("Key", { Type: "TaxOfficeNumber" }, doc.keys.officeNo), el("Key", { Type: "TaxOfficeReference" }, doc.keys.payeRef)]),
      el("PeriodEnd", periodEnd(doc.relatedTaxYear)),
      el("DefaultCurrency", "GBP"),
      irmark !== null ? el("IRmark", { Type: "generic" }, irmark) : null,
      el("Sender", "Employer"),
    ]),
    doc.body,
  ]);
}

/** Base32 (RFC 4648) — HMRC shows the IRmark to users in this form. */
function base32(buf: Buffer): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

export function computeIrmark(doc: Document): { base64: string; base32: string } {
  const bodyForMark = el("Body", { xmlns: GOVTALK_NAMESPACE }, [irEnvelope(doc, null)]);
  const digest = createHash("sha1").update(serialize(bodyForMark), "utf8").digest();
  return { base64: digest.toString("base64"), base32: base32(digest) };
}

export function buildGovTalkMessage(doc: Document, o: GovTalkOptions): { xml: string; irmark: { base64: string; base32: string } } {
  const irmark = computeIrmark(doc);
  const message = el("GovTalkMessage", { xmlns: GOVTALK_NAMESPACE }, [
    el("EnvelopeVersion", "2.0"),
    el("Header", [
      el("MessageDetails", [
        el("Class", `HMRC-PAYE-RTI-${o.kind}${o.testInLive ? "-TIL" : ""}`),
        el("Qualifier", "request"),
        el("Function", "submit"),
        el("CorrelationID"),
        el("Transformation", "XML"),
        o.gatewayTest ? el("GatewayTest", "1") : null,
      ]),
      el("SenderDetails", [
        el("IDAuthentication", [
          el("SenderID", o.senderId),
          el("Authentication", [el("Method", "clear"), el("Role", "principal"), el("Value", o.password)]),
        ]),
      ]),
    ]),
    el("GovTalkDetails", [
      el("Keys", [el("Key", { Type: "TaxOfficeNumber" }, doc.keys.officeNo), el("Key", { Type: "TaxOfficeReference" }, doc.keys.payeRef)]),
      el("TargetDetails", [el("Organisation", "HMRC")]),
      el("ChannelRouting", [
        el("Channel", [el("URI", o.vendorId), el("Product", o.product), el("Version", o.version)]),
        o.timestamp ? el("Timestamp", o.timestamp) : null,
      ]),
    ]),
    el("Body", [irEnvelope(doc, irmark.base64)]),
  ]);
  return { xml: `<?xml version="1.0" encoding="UTF-8"?>${serialize(message)}`, irmark };
}

/** A poll or delete request for a submission already accepted for processing. */
export function buildProtocolMessage(kind: RtiKind, testInLive: boolean, gatewayTest: boolean, qualifier: "poll", func: "submit" | "delete", correlationId: string): string;
export function buildProtocolMessage(kind: RtiKind, testInLive: boolean, gatewayTest: boolean, qualifier: "request", func: "delete", correlationId: string): string;
export function buildProtocolMessage(kind: RtiKind, testInLive: boolean, gatewayTest: boolean, qualifier: "poll" | "request", func: "submit" | "delete", correlationId: string): string {
  const message = el("GovTalkMessage", { xmlns: GOVTALK_NAMESPACE }, [
    el("EnvelopeVersion", "2.0"),
    el("Header", [
      el("MessageDetails", [
        el("Class", `HMRC-PAYE-RTI-${kind}${testInLive ? "-TIL" : ""}`),
        el("Qualifier", qualifier),
        el("Function", func),
        el("CorrelationID", correlationId),
        el("Transformation", "XML"),
        gatewayTest ? el("GatewayTest", "1") : null,
      ]),
      el("SenderDetails"),
    ]),
    el("GovTalkDetails", [el("Keys")]),
    el("Body"),
  ]);
  return `<?xml version="1.0" encoding="UTF-8"?>${serialize(message)}`;
}
