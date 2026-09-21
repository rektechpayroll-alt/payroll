import { NextRequest, NextResponse } from "next/server";
import { createBudgetLine } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const category = body?.category as string | undefined;
  const periodLabel = body?.periodLabel as string | undefined;
  const budgetedAmount = body?.budgetedAmount as number | undefined;

  if (!category?.trim() || !periodLabel?.trim() || !(typeof budgetedAmount === "number" && budgetedAmount > 0)) {
    return NextResponse.json({ error: "category, periodLabel and a positive budgetedAmount are required" }, { status: 400 });
  }

  const line = await createBudgetLine({ category: category.trim(), periodLabel: periodLabel.trim(), budgetedAmount });
  return NextResponse.json({ line });
}
