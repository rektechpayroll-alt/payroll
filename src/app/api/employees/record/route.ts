import { NextRequest } from "next/server";
import { payrollAction } from "@/lib/payroll/api";
import { updateEmployeeRecord } from "@/lib/payroll/records";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return payrollAction(async () => ({
    employee: await updateEmployeeRecord(String(b?.id ?? ""), {
      gender: b?.gender === "M" || b?.gender === "F" ? b.gender : null,
      addressLine1: str(b?.addressLine1),
      addressLine2: str(b?.addressLine2),
      postcode: str(b?.postcode),
      payrollId: str(b?.payrollId),
      starterDeclaration: ["A", "B", "C"].includes(b?.starterDeclaration) ? b.starterDeclaration : null,
      workingDays: Array.isArray(b?.workingDays) ? b.workingDays.map(Number) : [1, 2, 3, 4, 5],
      payrolledBenefitsAnnual: Number(b?.payrolledBenefitsAnnual ?? 0),
      bankAccountName: str(b?.bankAccountName),
      bankSortCode: str(b?.bankSortCode),
      bankAccountNumber: str(b?.bankAccountNumber),
    }),
  }));
}
