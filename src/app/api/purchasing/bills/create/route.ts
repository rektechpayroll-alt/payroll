import { NextRequest, NextResponse } from "next/server";
import { createBill } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const supplierName = body?.supplierName as string | undefined;
  const dueDate = body?.dueDate as string | undefined;
  const total = body?.total as number | undefined;

  if (!supplierName?.trim() || !dueDate?.trim() || !(typeof total === "number" && total > 0)) {
    return NextResponse.json({ error: "supplierName, dueDate and a positive total are required" }, { status: 400 });
  }

  const bill = await createBill({
    supplierName: supplierName.trim(),
    category: (body?.category as string | undefined)?.trim() || null,
    billDate: (body?.billDate as string | undefined)?.trim() || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
    dueDate: dueDate.trim(),
    total,
  });
  return NextResponse.json({ bill });
}
