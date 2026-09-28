import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { postRevaluation } from "@/lib/fx/revalue";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => ({ net: await postRevaluation(String(b?.date ?? "")) }));
}
