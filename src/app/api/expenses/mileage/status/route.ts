import { NextRequest, NextResponse } from "next/server";
import { updateMileageClaimStatus, type MileageClaim } from "@/lib/queries";

const VALID: MileageClaim["status"][] = ["submitted", "approved", "reimbursed"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const status = body?.status as MileageClaim["status"] | undefined;
  if (!id || !status || !VALID.includes(status)) {
    return NextResponse.json({ error: "id and a valid status are required" }, { status: 400 });
  }
  const claim = await updateMileageClaimStatus(id, status);
  return NextResponse.json({ claim });
}
