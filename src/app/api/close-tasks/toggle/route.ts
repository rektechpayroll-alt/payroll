import { NextRequest, NextResponse } from "next/server";
import { toggleCloseTask } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const task = await toggleCloseTask(id);
  return NextResponse.json({ task });
}
