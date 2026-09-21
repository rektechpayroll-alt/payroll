import { NextRequest, NextResponse } from "next/server";
import { updateExpenseClaimStatus, type ExpenseClaim } from "@/lib/queries";

const VALID: ExpenseClaim["status"][] = ["submitted", "approved", "reimbursed", "rejected"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const status = body?.status as ExpenseClaim["status"] | undefined;
  if (!id || !status || !VALID.includes(status)) {
    return NextResponse.json({ error: "id and a valid status are required" }, { status: 400 });
  }
  const claim = await updateExpenseClaimStatus(id, status);
  return NextResponse.json({ claim });
}
