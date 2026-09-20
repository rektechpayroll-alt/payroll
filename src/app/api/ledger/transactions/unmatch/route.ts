import { NextRequest, NextResponse } from "next/server";
import { unmatchTransaction } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const transactionId = body?.transactionId as string | undefined;
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId is required" }, { status: 400 });
  }
  const transaction = await unmatchTransaction(transactionId);
  return NextResponse.json({ transaction });
}
