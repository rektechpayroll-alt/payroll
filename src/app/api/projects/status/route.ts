import { NextRequest, NextResponse } from "next/server";
import { updateProjectStatus, type Project } from "@/lib/queries";

const VALID: Project["status"][] = ["active", "completed", "on_hold"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const status = body?.status as Project["status"] | undefined;
  if (!id || !status || !VALID.includes(status)) {
    return NextResponse.json({ error: "id and a valid status are required" }, { status: 400 });
  }
  const project = await updateProjectStatus(id, status);
  return NextResponse.json({ project });
}
