import { getCurrentRun, getLinesForRun, getEmployees } from "@/lib/queries";
import { nmwCheck, statutoryEligibility } from "@/lib/compliance";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const employees = await getEmployees();
  const run = await getCurrentRun();
  const lines = run ? await getLinesForRun(run.id) : [];
  const lineByEmployeeId = new Map(lines.filter((l) => l.employee_id).map((l) => [l.employee_id as string, l]));

  const rows = employees.map((e) => {
    const line = lineByEmployeeId.get(e.id) ?? null;
    const s = statutoryEligibility(e);
    const nmw = line ? nmwCheck(e, line) : null;
    return {
      name: e.name,
      role: e.role,
      tax_code: e.tax_code,
      ni_number: e.ni_number,
      employment_type: e.employment_type,
      nmw_status: nmw ? (nmw.pass ? "Pass" : "Below floor") : "No current run",
      nmw_rate: nmw ? nmw.rate.toFixed(2) : "",
      ssp_eligible: "Yes",
      family_leave_eligible: s.familyLeave.eligible ? "Yes" : "Not yet",
      ir35_status: s.ir35.status,
    };
  });

  const csv = toCsv(rows, [
    { key: "name", label: "Employee" },
    { key: "role", label: "Role" },
    { key: "tax_code", label: "Tax code" },
    { key: "ni_number", label: "NI number" },
    { key: "employment_type", label: "Employment type" },
    { key: "nmw_status", label: "NMW check" },
    { key: "nmw_rate", label: "Estimated hourly rate (GBP)" },
    { key: "ssp_eligible", label: "SSP eligible" },
    { key: "family_leave_eligible", label: "SMP/SPP/SAP/ShPP eligible" },
    { key: "ir35_status", label: "IR35 status" },
  ]);

  return csvResponse("statutory-compliance-summary.csv", csv);
}
