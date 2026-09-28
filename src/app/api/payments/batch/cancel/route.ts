import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { cancelBatch } from "@/lib/payments/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => cancelBatch(String(b?.id ?? "")));
}
