import { NextRequest, NextResponse } from "next/server";
import { createExpenseClaim } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const employeeId = body?.employeeId as string | undefined;
  const description = body?.description as string | undefined;
  const category = body?.category as string | undefined;
  const amount = body?.amount as number | undefined;
  const expenseDate = body?.expenseDate as string | undefined;

  if (!employeeId || !description?.trim() || !category?.trim() || !(typeof amount === "number" && amount > 0) || !expenseDate?.trim()) {
    return NextResponse.json({ error: "employeeId, description, category, a positive amount and expenseDate are required" }, { status: 400 });
  }

  const claim = await createExpenseClaim({ employeeId, description: description.trim(), category: category.trim(), amount, expenseDate: expenseDate.trim() });
  return NextResponse.json({ claim });
}
