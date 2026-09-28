import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { finaliseVatReturn, VatError } from "@/lib/vat/returns";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => {
    const start = String(b?.start ?? "");
    const end = String(b?.end ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) throw new VatError("Choose a VAT period.");
    return { returnId: await finaliseVatReturn(start, end) };
  });
}
