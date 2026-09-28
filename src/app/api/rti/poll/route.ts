import { NextRequest } from "next/server";
import { rtiAction } from "@/lib/rti/api";
import { pollRti } from "@/lib/rti/submissions";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return rtiAction(async () => ({ submission: await pollRti(String(b?.id ?? "")) }));
}
