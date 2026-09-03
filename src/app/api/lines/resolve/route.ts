import { NextRequest, NextResponse } from "next/server";
import { resolveLine } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const lineId = body?.lineId as string | undefined;
  if (!lineId) {
    return NextResponse.json({ error: "lineId is required" }, { status: 400 });
  }
  const line = resolveLine(lineId);
  return NextResponse.json({ line });
}
