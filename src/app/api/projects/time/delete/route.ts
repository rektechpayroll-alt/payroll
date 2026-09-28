import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { deleteTime } from "@/lib/projects/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => deleteTime(String(b?.id ?? "")));
}
