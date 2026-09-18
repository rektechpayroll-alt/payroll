import { getCostTrend } from "@/lib/queries";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const trend = await getCostTrend();
  const csv = toCsv(
    trend.map((t) => ({
      month_label: t.month_label,
      cost_to_company: t.cost_to_company.toFixed(2),
      deals_index: t.deals_index,
      headcount_index: t.headcount_index,
    })),
    [
      { key: "month_label", label: "Month" },
      { key: "cost_to_company", label: "Cost to company (GBP)" },
      { key: "deals_index", label: "Deals index" },
      { key: "headcount_index", label: "Headcount index" },
    ]
  );
  return csvResponse("cost-trend-6-months.csv", csv);
}
