import { NextRequest } from "next/server";
import { bankAction } from "@/lib/banking/api";
import { BankError, importStatement } from "@/lib/banking/bank";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return bankAction(async () => {
    if (typeof b?.content !== "string" || !b.content.trim()) throw new BankError("Choose a CSV or OFX statement file.");
    return importStatement(String(b?.filename ?? "statement.csv"), b.content);
  });
}
