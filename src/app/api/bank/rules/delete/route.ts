import { NextRequest } from "next/server";
import { bankAction } from "@/lib/banking/api";
import { deleteRule } from "@/lib/banking/bank";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return bankAction(() => deleteRule(String(b?.id ?? "")));
}
