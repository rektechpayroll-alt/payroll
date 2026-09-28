import { NextRequest } from "next/server";
import { payrollAction } from "@/lib/payroll/api";
import { updatePayLine } from "@/lib/payroll/runs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return payrollAction(() =>
    updatePayLine(String(body?.lineId ?? ""), {
      additions: Number(body?.additions ?? 0),
      hoursWorked: body?.hoursWorked === null || body?.hoursWorked === undefined || body?.hoursWorked === "" ? null : Number(body.hoursWorked),
    })
  );
}
