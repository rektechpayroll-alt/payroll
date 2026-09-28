import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { deleteForecastItem } from "@/lib/insights/data";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => deleteForecastItem(String(b?.id ?? "")));
}
