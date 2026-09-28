import { NextRequest, NextResponse } from "next/server";
import { xmlDownload } from "@/lib/rti/api";
import { envelopeForDownload, prepareEps, RtiError } from "@/lib/rti/submissions";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  try {
    const { doc } = await prepareEps(p.get("taxYear") ?? "", Number(p.get("taxMonth")), { noPayment: p.get("noPayment") === "1" });
    const { xml } = envelopeForDownload("EPS", doc, p.get("til") === "1");
    return xmlDownload(xml, `EPS-${p.get("taxYear")}-M${p.get("taxMonth")}.xml`);
  } catch (e) {
    if (e instanceof RtiError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
