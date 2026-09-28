import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { emailInvoice } from "@/lib/invoicing/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => emailInvoice(String(b?.id ?? ""), typeof b?.to === "string" ? b.to : undefined));
}
