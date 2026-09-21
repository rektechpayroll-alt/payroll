import { getInvoices, getBills, getExpenseClaims, getMileageClaims, getCurrentRun } from "@/lib/queries";
import { computeProfitAndLoss } from "@/lib/pnl";
import { toCsv, csvResponse } from "@/lib/csv";

export async function GET() {
  const [invoices, bills, expenseClaims, mileageClaims, currentRun] = await Promise.all([
    getInvoices(),
    getBills(),
    getExpenseClaims(),
    getMileageClaims(),
    getCurrentRun(),
  ]);
  const pnl = computeProfitAndLoss(invoices, bills, expenseClaims, mileageClaims, currentRun ?? null);

  const csv = toCsv(
    [
      { line: "Revenue (invoiced)", amount: pnl.revenue.toFixed(2) },
      { line: "Payroll cost (gross + employer NI + pension)", amount: (-pnl.payrollCost).toFixed(2) },
      { line: "Bills", amount: (-pnl.operatingExpenses.bills).toFixed(2) },
      { line: "Expense claims", amount: (-pnl.operatingExpenses.expenseClaims).toFixed(2) },
      { line: "Mileage", amount: (-pnl.operatingExpenses.mileage).toFixed(2) },
      { line: "Net profit", amount: pnl.netProfit.toFixed(2) },
    ],
    [
      { key: "line", label: "Line" },
      { key: "amount", label: "Amount (GBP)" },
    ]
  );

  return csvResponse(`profit-and-loss-${currentRun?.period_label?.replace(/\s+/g, "-") ?? "current"}.csv`, csv);
}
