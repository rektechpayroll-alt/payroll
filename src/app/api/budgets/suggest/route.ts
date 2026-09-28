import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { applySuggestedBudgets } from "@/lib/insights/data";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => ({ filled: await applySuggestedBudgets(String(b?.start ?? "")) }));
}
