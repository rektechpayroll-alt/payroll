import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { updateSupplierBank } from "@/lib/payments/service";
import { bankInput } from "../input";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => updateSupplierBank(String(b?.name ?? ""), bankInput(b)));
}
