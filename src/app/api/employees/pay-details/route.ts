import { NextRequest } from "next/server";
import { payrollAction } from "@/lib/payroll/api";
import { FREQUENCY_LABELS, NI_CATEGORIES, type NiCategory, type PayFrequency } from "@/lib/payroll/engine";
import { PayRunError } from "@/lib/payroll/runs";
import { updateEmployeePayDetails } from "@/lib/queries";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return payrollAction(async () => {
    const payBasis = b?.payBasis === "hourly" ? "hourly" : "salary";
    const annualSalary = num(b?.annualSalary);
    const hourlyRate = num(b?.hourlyRate);
    const payFrequency = b?.payFrequency as PayFrequency;
    const niCategory = b?.niCategory as NiCategory;
    const plan = ["1", "2", "4", "5"].includes(b?.studentLoanPlan) ? (b.studentLoanPlan as "1" | "2" | "4" | "5") : null;
    const eePct = Number(b?.pensionEmployeePct ?? 5);
    const erPct = Number(b?.pensionEmployerPct ?? 3);
    const previousPay = Number(b?.previousPay ?? 0);
    const previousTax = Number(b?.previousTax ?? 0);

    if (!(payFrequency in FREQUENCY_LABELS)) throw new PayRunError("Choose a pay frequency.");
    if (!(niCategory in NI_CATEGORIES)) throw new PayRunError("Choose an NI category letter.");
    if (payBasis === "salary" && !(annualSalary !== null && annualSalary >= 0 && annualSalary < 10_000_000)) throw new PayRunError("Enter an annual salary.");
    if (payBasis === "hourly" && !(hourlyRate !== null && hourlyRate >= 0 && hourlyRate < 10_000)) throw new PayRunError("Enter an hourly rate.");
    if (![eePct, erPct].every((p) => Number.isFinite(p) && p >= 0 && p <= 100)) throw new PayRunError("Pension percentages must be between 0 and 100.");
    if (b?.pensionEnrolled !== false && erPct < 3) throw new PayRunError("Auto-enrolment requires at least a 3% employer contribution.");
    if (![previousPay, previousTax].every((v) => Number.isFinite(v) && Math.abs(v) < 10_000_000)) throw new PayRunError("Check the P45 figures.");

    const employee = await updateEmployeePayDetails(String(b?.id ?? ""), {
      payBasis,
      annualSalary: payBasis === "salary" ? annualSalary : null,
      hourlyRate: payBasis === "hourly" ? hourlyRate : null,
      payFrequency,
      niCategory,
      studentLoanPlan: plan,
      postgradLoan: b?.postgradLoan === true,
      pensionEnrolled: b?.pensionEnrolled !== false,
      pensionEmployeePct: eePct,
      pensionEmployerPct: erPct,
      dateOfBirth: isoDate(b?.dateOfBirth),
      isDirector: b?.isDirector === true,
      previousPay,
      previousTax,
      leavingDate: isoDate(b?.leavingDate),
    });
    return { employee };
  });
}
