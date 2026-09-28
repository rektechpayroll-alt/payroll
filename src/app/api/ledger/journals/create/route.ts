import { NextRequest } from "next/server";
import { ledgerAction } from "@/lib/ledger/api";
import { createManualJournal, type ManualLine } from "@/lib/ledger/reports";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return ledgerAction(async () => ({
    journalId: await createManualJournal({
      date: String(b?.date ?? ""),
      narration: String(b?.narration ?? ""),
      lines: Array.isArray(b?.lines)
        ? (b.lines as ManualLine[]).slice(0, 50).map((l) => ({ accountCode: String(l.accountCode ?? ""), description: String(l.description ?? ""), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }))
        : [],
    }),
  }));
}
