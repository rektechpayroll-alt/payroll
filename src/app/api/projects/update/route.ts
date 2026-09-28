import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { updateProject } from "@/lib/projects/service";
import { projectInput } from "../input";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() => updateProject(String(b?.id ?? ""), projectInput(b)));
}
