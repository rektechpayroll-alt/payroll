import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { deleteRecurring } from "@/lib/invoicing/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => deleteRecurring(String(b?.id ?? "")));
}
