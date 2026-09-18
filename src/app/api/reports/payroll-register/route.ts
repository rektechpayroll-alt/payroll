import { getCurrentRun, getLinesForRun } from "@/lib/queries";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const run = await getCurrentRun();
  const lines = run ? await getLinesForRun(run.id) : [];

  const csv = toCsv(
    lines.map((l) => ({
      employee_name: l.employee_name,
      role: l.role,
      net_pay: l.net_pay.toFixed(2),
      status: l.severity ? (l.resolved ? "Resolved" : "Flagged") : "Clear",
      severity: l.severity ?? "",
      source: l.source ?? "",
      tag: l.tag_label ?? "",
      reason: l.reason ?? "",
    })),
    [
      { key: "employee_name", label: "Employee" },
      { key: "role", label: "Role" },
      { key: "net_pay", label: "Net pay (GBP)" },
      { key: "status", label: "Status" },
      { key: "severity", label: "Severity" },
      { key: "source", label: "Source" },
      { key: "tag", label: "Tag" },
      { key: "reason", label: "Reason" },
    ]
  );

  return csvResponse(`payroll-register-${run?.period_label?.replace(/\s+/g, "-") ?? "run"}.csv`, csv);
}
