import { NextRequest, NextResponse } from "next/server";
import { xmlDownload } from "@/lib/rti/api";
import { envelopeForDownload, prepareFps, RtiError } from "@/lib/rti/submissions";

/** The FPS for a run as GovTalk XML (placeholder credentials) — for checking or HMRC's Local Test Service. */
export async function GET(req: NextRequest) {
  try {
    const runId = req.nextUrl.searchParams.get("runId") ?? "";
    const { doc } = await prepareFps(runId);
    const { xml } = envelopeForDownload("FPS", doc, req.nextUrl.searchParams.get("til") === "1");
    return xmlDownload(xml, `FPS-${runId.slice(0, 8)}.xml`);
  } catch (e) {
    if (e instanceof RtiError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
