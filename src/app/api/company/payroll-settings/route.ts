import { NextRequest } from "next/server";
import { payrollAction } from "@/lib/payroll/api";
import { updatePayrollSettings } from "@/lib/payroll/records";

const str = (v: unknown) => (typeof v === "string" ? v : null);

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return payrollAction(async () => ({
    settings: await updatePayrollSettings({
      payeReference: str(b?.payeReference),
      accountsOfficeReference: str(b?.accountsOfficeReference),
      pensionScheme: b?.pensionScheme,
      claimEmploymentAllowance: b?.claimEmploymentAllowance === true,
      smallEmployerRelief: b?.smallEmployerRelief === true,
      bankAccountName: str(b?.bankAccountName),
      bankSortCode: str(b?.bankSortCode),
      bankAccountNumber: str(b?.bankAccountNumber),
      bacsSun: str(b?.bacsSun),
    }),
  }));
}
