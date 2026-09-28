import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { sendReminder } from "@/lib/invoicing/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => sendReminder(String(b?.id ?? ""), Number(b?.step) || 0));
}
