import { NextRequest } from "next/server";
import { bankAction } from "@/lib/banking/api";
import { createRule } from "@/lib/banking/bank";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return bankAction(() => createRule(String(b?.contains ?? ""), b?.direction ?? "any", String(b?.accountCode ?? "")));
}
