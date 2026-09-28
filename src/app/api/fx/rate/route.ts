import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { gbpRate } from "@/lib/fx/rates";

export async function GET(req: NextRequest) {
  const currency = req.nextUrl.searchParams.get("currency") ?? "";
  const date = req.nextUrl.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  return jsonAction(() => gbpRate(currency, date));
}
