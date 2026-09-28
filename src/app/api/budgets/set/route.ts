import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { setBudget } from "@/lib/insights/data";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => setBudget(String(b?.start ?? ""), String(b?.code ?? ""), Array.isArray(b?.amounts) ? b.amounts.map(Number) : []));
}
