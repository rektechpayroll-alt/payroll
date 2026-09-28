import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { addCost } from "@/lib/projects/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => ({
    id: await addCost({ projectId: String(b?.projectId ?? ""), date: String(b?.date ?? ""), description: String(b?.description ?? ""), amount: Number(b?.amount), billable: b?.billable !== false, markupPct: Number(b?.markupPct) || 0 }),
  }));
}
