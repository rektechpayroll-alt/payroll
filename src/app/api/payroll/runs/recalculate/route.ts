import { NextRequest } from "next/server";
import { payrollAction } from "@/lib/payroll/api";
import { recalculatePayRun } from "@/lib/payroll/runs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return payrollAction(() => recalculatePayRun(String(body?.runId ?? "")));
}
