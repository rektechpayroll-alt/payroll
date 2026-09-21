import { NextRequest, NextResponse } from "next/server";
import { createQuote } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const customerName = body?.customerName as string | undefined;
  const items = body?.items as Array<{ description: string; quantity: number; unitPrice: number }> | undefined;

  if (!customerName?.trim() || !items?.length) {
    return NextResponse.json({ error: "customerName and at least one item are required" }, { status: 400 });
  }
  if (items.some((it) => !it.description?.trim() || !(it.quantity > 0) || !(it.unitPrice >= 0))) {
    return NextResponse.json({ error: "every item needs a description, a positive quantity and a non-negative unit price" }, { status: 400 });
  }

  const quote = await createQuote({
    customerName: customerName.trim(),
    customerEmail: (body?.customerEmail as string | undefined)?.trim() || null,
    expiryDate: (body?.expiryDate as string | undefined)?.trim() || "",
    items,
  });
  return NextResponse.json({ quote });
}
