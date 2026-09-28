import { NextRequest } from "next/server";
import { payrollAction } from "@/lib/payroll/api";
import { deletePayRun } from "@/lib/payroll/runs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return payrollAction(() => deletePayRun(String(body?.runId ?? "")));
}
