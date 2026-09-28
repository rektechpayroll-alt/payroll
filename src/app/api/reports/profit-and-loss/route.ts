import { NextRequest } from "next/server";
import { profitAndLoss } from "@/lib/ledger/reports";
import { toCsv, csvResponse } from "@/lib/csv";

/** Profit & loss from the general ledger. Defaults to the current UK tax year to date. */
export async function GET(req: NextRequest) {
  const today = new Date();
  const y = today.getUTCFullYear();
  const taxStart = today >= new Date(Date.UTC(y, 3, 6)) ? `${y}-04-06` : `${y - 1}-04-06`;
  const from = req.nextUrl.searchParams.get("from") ?? taxStart;
  const to = req.nextUrl.searchParams.get("to") ?? today.toISOString().slice(0, 10);
  const pl = await profitAndLoss(from, to);
  const rows = [
    ...pl.income.map((a) => ({ section: "Income", account: `${a.code} ${a.name}`, amount: a.balance.toFixed(2) })),
    { section: "Income", account: "Total income", amount: pl.totalIncome.toFixed(2) },
    ...pl.costOfSales.map((a) => ({ section: "Cost of sales", account: `${a.code} ${a.name}`, amount: (-a.balance).toFixed(2) })),
    { section: "", account: "Gross profit", amount: pl.grossProfit.toFixed(2) },
    ...pl.expenses.map((a) => ({ section: "Overheads", account: `${a.code} ${a.name}`, amount: (-a.balance).toFixed(2) })),
    { section: "Overheads", account: "Total overheads", amount: (-pl.totalExpenses).toFixed(2) },
    { section: "", account: "Net profit", amount: pl.netProfit.toFixed(2) },
  ];
  const csv = toCsv(rows, [
    { key: "section", label: "Section" },
    { key: "account", label: "Account" },
    { key: "amount", label: "Amount (GBP)" },
  ]);
  return csvResponse(`profit-and-loss-${from}-to-${to}.csv`, csv);
}
