import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { convertPurchaseOrderToBill } from "@/lib/queries";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const id = body?.id as string | undefined;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const result = await convertPurchaseOrderToBill(id);
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
