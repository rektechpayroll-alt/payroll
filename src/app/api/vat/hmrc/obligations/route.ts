import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { fetchObligations, fraudPreventionHeaders } from "@/lib/vat/mtd";
import { parseDevice, requestMeta } from "@/lib/vat/request-meta";
import { getVatSettings, VatError } from "@/lib/vat/returns";
import { getSession } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => {
    const device = parseDevice(b?.device);
    if (!device) throw new VatError("Your browser details are needed for HMRC's fraud prevention checks — reload and try again.");
    const s = await getVatSettings();
    if (!s.vat_number) throw new VatError("Add your VAT number in VAT settings.");
    const today = new Date();
    const from = new Date(today.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
    const to = today.toISOString().slice(0, 10);
    return { obligations: await fetchObligations(s.vat_number, fraudPreventionHeaders(device, requestMeta(req), (await getSession()).userId), from, to) };
  });
}
