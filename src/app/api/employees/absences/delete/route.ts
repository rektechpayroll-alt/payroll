import { NextRequest } from "next/server";
import { payrollAction } from "@/lib/payroll/api";
import { deleteAbsence } from "@/lib/payroll/records";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return payrollAction(() => deleteAbsence(String(b?.id ?? "")));
}
