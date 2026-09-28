import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { fileVatReturn } from "@/lib/vat/mtd";
import { parseDevice, requestMeta } from "@/lib/vat/request-meta";
import { VatError } from "@/lib/vat/returns";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => {
    const device = parseDevice(b?.device);
    if (!device) throw new VatError("Your browser details are needed for HMRC's fraud prevention checks — reload and try again.");
    if (b?.declaration !== true) throw new VatError("Confirm the declaration before filing.");
    return fileVatReturn(String(b?.returnId ?? ""), String(b?.periodKey ?? ""), device, requestMeta(req));
  });
}
