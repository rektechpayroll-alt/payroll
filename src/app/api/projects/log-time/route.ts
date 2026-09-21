import { NextRequest, NextResponse } from "next/server";
import { logProjectTime } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const projectId = body?.projectId as string | undefined;
  const employeeId = body?.employeeId as string | undefined;
  const hours = body?.hours as number | undefined;

  if (!projectId || !employeeId || !(typeof hours === "number" && hours > 0)) {
    return NextResponse.json({ error: "projectId, employeeId and a positive hours value are required" }, { status: 400 });
  }

  const entry = await logProjectTime({ projectId, employeeId, hours, note: (body?.note as string | undefined)?.trim() || null });
  return NextResponse.json({ entry });
}
