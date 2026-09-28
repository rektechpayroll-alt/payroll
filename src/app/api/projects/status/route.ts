import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { setProjectStatus } from "@/lib/projects/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => setProjectStatus(String(b?.id ?? ""), String(b?.status ?? "")));
}
