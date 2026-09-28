import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { deleteCost } from "@/lib/projects/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => deleteCost(String(b?.id ?? "")));
}
