import { NextRequest, NextResponse } from "next/server";
import { createInvoice } from "@/lib/queries";

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

  const invoice = await createInvoice({
    customerName: customerName.trim(),
    customerEmail: (body?.customerEmail as string | undefined)?.trim() || null,
    issueDate: (body?.issueDate as string | undefined)?.trim() || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    dueDate: (body?.dueDate as string | undefined)?.trim() || "",
    vatRate: typeof body?.vatRate === "number" ? body.vatRate : 20,
    notes: (body?.notes as string | undefined)?.trim() || null,
    items,
  });

  return NextResponse.json({ invoice });
}
