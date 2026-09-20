import { NextRequest, NextResponse } from "next/server";
import { matchTransaction } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const transactionId = body?.transactionId as string | undefined;
  const invoiceId = body?.invoiceId as string | undefined;
  if (!transactionId || !invoiceId) {
    return NextResponse.json({ error: "transactionId and invoiceId are required" }, { status: 400 });
  }
  const result = await matchTransaction(transactionId, invoiceId);
  return NextResponse.json(result);
}
