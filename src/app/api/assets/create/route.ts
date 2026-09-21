import { NextRequest, NextResponse } from "next/server";
import { createFixedAsset } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = body?.name as string | undefined;
  const category = body?.category as string | undefined;
  const purchaseDate = body?.purchaseDate as string | undefined;
  const purchaseCost = body?.purchaseCost as number | undefined;
  const usefulLifeYears = body?.usefulLifeYears as number | undefined;

  if (!name?.trim() || !category?.trim() || !purchaseDate?.trim() || !(typeof purchaseCost === "number" && purchaseCost > 0) || !(typeof usefulLifeYears === "number" && usefulLifeYears > 0)) {
    return NextResponse.json({ error: "name, category, purchaseDate, a positive purchaseCost and a positive usefulLifeYears are required" }, { status: 400 });
  }

  const asset = await createFixedAsset({ name: name.trim(), category: category.trim(), purchaseDate: purchaseDate.trim(), purchaseCost, usefulLifeYears });
  return NextResponse.json({ asset });
}
