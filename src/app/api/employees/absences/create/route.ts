import { NextRequest } from "next/server";
import { payrollAction } from "@/lib/payroll/api";
import { createAbsence } from "@/lib/payroll/records";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return payrollAction(async () => ({
    absence: await createAbsence({
      employeeId: String(b?.employeeId ?? ""),
      type: b?.type,
      startDate: String(b?.startDate ?? ""),
      endDate: String(b?.endDate ?? ""),
      averageWeeklyEarnings: b?.averageWeeklyEarnings === "" || b?.averageWeeklyEarnings == null ? null : Number(b.averageWeeklyEarnings),
      deductPay: b?.deductPay !== false,
      notes: typeof b?.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 500) : null,
    }),
  }));
}
