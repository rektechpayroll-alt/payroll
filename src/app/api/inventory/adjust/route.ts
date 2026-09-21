import { NextRequest, NextResponse } from "next/server";
import { adjustStock } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const itemId = body?.itemId as string | undefined;
  const change = body?.change as number | undefined;
  const reason = body?.reason as string | undefined;

  if (!itemId || typeof change !== "number" || change === 0 || !reason?.trim()) {
    return NextResponse.json({ error: "itemId, a non-zero change and a reason are required" }, { status: 400 });
  }

  const item = await adjustStock(itemId, change, reason.trim());
  return NextResponse.json({ item });
}
