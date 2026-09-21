import { NextRequest, NextResponse } from "next/server";
import { createMileageClaim } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const employeeId = body?.employeeId as string | undefined;
  const tripDate = body?.tripDate as string | undefined;
  const from = body?.from as string | undefined;
  const to = body?.to as string | undefined;
  const miles = body?.miles as number | undefined;

  if (!employeeId || !tripDate?.trim() || !from?.trim() || !to?.trim() || !(typeof miles === "number" && miles > 0)) {
    return NextResponse.json({ error: "employeeId, tripDate, from, to and a positive miles value are required" }, { status: 400 });
  }

  const claim = await createMileageClaim({ employeeId, tripDate: tripDate.trim(), from: from.trim(), to: to.trim(), miles });
  return NextResponse.json({ claim });
}
