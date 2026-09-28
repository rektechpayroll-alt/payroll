import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { markBatchPaid } from "@/lib/payments/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => ({ paid: await markBatchPaid(String(b?.id ?? "")) }));
}
