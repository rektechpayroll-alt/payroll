import { NextRequest } from "next/server";
import { payrollAction } from "@/lib/payroll/api";
import { FREQUENCY_LABELS, type PayFrequency } from "@/lib/payroll/engine";
import { createPayRun, PayRunError } from "@/lib/payroll/runs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return payrollAction(async () => {
    const frequency = body?.frequency as PayFrequency;
    const payDate = body?.payDate as string;
    if (!(frequency in FREQUENCY_LABELS)) throw new PayRunError("Choose a pay frequency.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate ?? "")) throw new PayRunError("Choose a payday.");
    return { runId: await createPayRun(frequency, payDate) };
  });
}
