import { NextRequest } from "next/server";
import { bankAction } from "@/lib/banking/api";
import { BankError, reconcileLine, type ReconcileTarget } from "@/lib/banking/bank";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return bankAction(async () => {
    const t = b?.target;
    let target: ReconcileTarget;
    if (t?.kind === "account") target = { kind: "account", accountCode: String(t.accountCode ?? ""), ruleId: typeof t.ruleId === "string" ? t.ruleId : undefined };
    else if (["invoice", "bill", "payroll", "recorded"].includes(t?.kind)) target = { kind: t.kind, id: String(t.id ?? "") };
    else throw new BankError("Choose what this line is.");
    await reconcileLine(String(b?.lineId ?? ""), target);
  });
}
