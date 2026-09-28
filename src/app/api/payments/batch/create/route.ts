import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { createPaymentBatch, type PaymentFormat } from "@/lib/payments/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() =>
    createPaymentBatch({ billIds: Array.isArray(b?.billIds) ? b.billIds.map(String) : [], format: String(b?.format ?? "") as PaymentFormat, executionDate: String(b?.executionDate ?? "") })
  );
}
