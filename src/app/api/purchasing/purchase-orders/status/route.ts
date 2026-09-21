import { NextRequest, NextResponse } from "next/server";
import { updatePurchaseOrderStatus, type PurchaseOrder } from "@/lib/queries";

const VALID: PurchaseOrder["status"][] = ["draft", "sent", "received", "converted_to_bill"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const status = body?.status as PurchaseOrder["status"] | undefined;
  if (!id || !status || !VALID.includes(status)) {
    return NextResponse.json({ error: "id and a valid status are required" }, { status: 400 });
  }
  const purchaseOrder = await updatePurchaseOrderStatus(id, status);
  return NextResponse.json({ purchaseOrder });
}
