import { NextRequest } from "next/server";
import { ledgerAction } from "@/lib/ledger/api";
import { recordWagesPaid } from "@/lib/ledger/reports";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return ledgerAction(() => recordWagesPaid(String(b?.runId ?? "")));
}
