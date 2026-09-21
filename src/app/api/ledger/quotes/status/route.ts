import { NextRequest, NextResponse } from "next/server";
import { updateQuoteStatus, type Quote } from "@/lib/queries";

const VALID: Quote["status"][] = ["draft", "sent", "accepted", "declined", "converted"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const status = body?.status as Quote["status"] | undefined;
  if (!id || !status || !VALID.includes(status)) {
    return NextResponse.json({ error: "id and a valid status are required" }, { status: 400 });
  }
  const quote = await updateQuoteStatus(id, status);
  return NextResponse.json({ quote });
}
