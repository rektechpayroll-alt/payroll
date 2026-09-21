import { NextRequest, NextResponse } from "next/server";
import { createProject } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = body?.name as string | undefined;
  const clientName = body?.clientName as string | undefined;
  const budget = body?.budget as number | undefined;
  const startDate = body?.startDate as string | undefined;

  if (!name?.trim() || !clientName?.trim() || !(typeof budget === "number" && budget > 0) || !startDate?.trim()) {
    return NextResponse.json({ error: "name, clientName, a positive budget and startDate are required" }, { status: 400 });
  }

  const project = await createProject({ name: name.trim(), clientName: clientName.trim(), budget, startDate: startDate.trim() });
  return NextResponse.json({ project });
}
