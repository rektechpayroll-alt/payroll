import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { logTime } from "@/lib/projects/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => ({
    id: await logTime({ projectId: String(b?.projectId ?? ""), employeeId: String(b?.employeeId ?? ""), date: String(b?.date ?? ""), hours: Number(b?.hours), billable: b?.billable !== false, note: b?.note ? String(b.note) : null }),
  }));
}
