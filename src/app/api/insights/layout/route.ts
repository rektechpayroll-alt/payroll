import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { saveDashboardLayout } from "@/lib/insights/data";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => saveDashboardLayout(Array.isArray(b?.widgets) ? b.widgets.map(String) : []));
}
