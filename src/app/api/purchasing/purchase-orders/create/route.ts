import { NextRequest, NextResponse } from "next/server";
import { createPurchaseOrder } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const supplierName = body?.supplierName as string | undefined;
  const items = body?.items as Array<{ description: string; quantity: number; unitPrice: number }> | undefined;

  if (!supplierName?.trim() || !items?.length) {
    return NextResponse.json({ error: "supplierName and at least one item are required" }, { status: 400 });
  }
  if (items.some((it) => !it.description?.trim() || !(it.quantity > 0) || !(it.unitPrice >= 0))) {
    return NextResponse.json({ error: "every item needs a description, a positive quantity and a non-negative unit price" }, { status: 400 });
  }

  const purchaseOrder = await createPurchaseOrder({ supplierName: supplierName.trim(), items });
  return NextResponse.json({ purchaseOrder });
}
