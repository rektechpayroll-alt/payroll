import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { setRecurringActive } from "@/lib/invoicing/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => setRecurringActive(String(b?.id ?? ""), b?.active === true));
}
