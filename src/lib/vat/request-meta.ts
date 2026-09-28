import type { NextRequest } from "next/server";
import type { ClientDeviceInfo } from "./mtd";

/** Connection details for HMRC's fraud prevention headers, from the incoming request. */
export function requestMeta(req: NextRequest) {
  const forwardedFor = (req.headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const clientIp = req.headers.get("x-real-ip") ?? forwardedFor[0] ?? null;
  return {
    clientIp,
    clientPort: req.headers.get("x-forwarded-port") && req.headers.get("x-forwarded-port") !== "443" ? req.headers.get("x-forwarded-port") : null,
    vendorIp: null,
    forwarded: clientIp ? [{ by: req.nextUrl.hostname, for: clientIp }] : [],
  };
}

export function parseDevice(raw: unknown): ClientDeviceInfo | null {
  const d = raw as Partial<ClientDeviceInfo> | null;
  if (!d || typeof d.deviceId !== "string" || typeof d.userAgent !== "string" || typeof d.timezone !== "string" || !Array.isArray(d.screens) || !d.windowSize) return null;
  return d as ClientDeviceInfo;
}
