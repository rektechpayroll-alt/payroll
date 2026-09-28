import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { addForecastItem } from "@/lib/insights/data";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => ({ id: await addForecastItem({ date: String(b?.date ?? ""), label: String(b?.label ?? ""), amount: Number(b?.amount) }) }));
}
