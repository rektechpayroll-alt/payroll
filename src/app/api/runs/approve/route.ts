import { NextRequest, NextResponse } from "next/server";
import { approveRun, getCurrentRun } from "@/lib/queries";

export async function POST(_req: NextRequest) {
  const run = await getCurrentRun();
  if (!run) return NextResponse.json({ error: "No payroll run to approve" }, { status: 404 });
  try {
    return NextResponse.json(await approveRun(run.id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't approve this run" }, { status: 400 });
  }
}
