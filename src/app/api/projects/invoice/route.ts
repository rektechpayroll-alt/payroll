import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { invoiceProject } from "@/lib/projects/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() =>
    invoiceProject({
      projectId: String(b?.projectId ?? ""),
      amount: b?.amount === undefined ? undefined : Number(b.amount),
      description: b?.description ? String(b.description) : undefined,
      dueDays: b?.dueDays === undefined ? undefined : Number(b.dueDays),
      vatRate: b?.vatRate === undefined ? undefined : Number(b.vatRate),
    })
  );
}
