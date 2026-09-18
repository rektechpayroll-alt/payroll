import { getAuditLog } from "@/lib/queries";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const entries = await getAuditLog(50);
  const csv = toCsv(
    entries.map((e) => ({ occurred_at: e.occurred_at, kind: e.kind, message: e.message, detail: e.detail })),
    [
      { key: "occurred_at", label: "When" },
      { key: "kind", label: "Kind" },
      { key: "message", label: "Message" },
      { key: "detail", label: "Detail" },
    ]
  );
  return csvResponse("audit-trail.csv", csv);
}
