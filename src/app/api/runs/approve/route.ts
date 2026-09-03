import { NextRequest, NextResponse } from "next/server";
import { approveRun, getCurrentRun } from "@/lib/queries";

export async function POST(_req: NextRequest) {
  const run = getCurrentRun();
  const result = approveRun(run.id);
  return NextResponse.json(result);
}
