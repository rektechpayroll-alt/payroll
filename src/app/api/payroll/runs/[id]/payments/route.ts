import { NextRequest, NextResponse } from "next/server";
import { paymentsCsv, standard18, type Payee } from "@/lib/payroll/payments";
import { getPayrollSettings } from "@/lib/payroll/records";
import { getPayRun, getPayslipLines } from "@/lib/payroll/runs";

/** Download the net-pay payment file for an approved run. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await getPayRun(id);
  if (!run || run.source !== "engine") return NextResponse.json({ error: "Pay run not found" }, { status: 404 });
  if (!run.status.startsWith("approved")) return NextResponse.json({ error: "Approve the run before paying it" }, { status: 400 });

  const lines = await getPayslipLines(id);
  const payees: Payee[] = [];
  const missing: string[] = [];
  for (const l of lines) {
    if (l.net_pay <= 0) continue;
    if (!l.bank_sort_code || !l.bank_account_number) {
      missing.push(l.employee_name);
      continue;
    }
    payees.push({
      name: l.bank_account_name || l.employee_name,
      sortCode: l.bank_sort_code,
      accountNumber: l.bank_account_number,
      amountPence: Math.round(l.net_pay * 100),
      reference: `SALARY ${run.pay_date ?? ""}`.trim(),
    });
  }

  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  let body: string;
  let filename: string;
  if (format === "std18") {
    const s = await getPayrollSettings();
    if (!s.bacs_sun || !s.bank_sort_code || !s.bank_account_number) {
      return NextResponse.json({ error: "Add your BACS Service User Number and company bank account in Settings first" }, { status: 400 });
    }
    body = standard18(payees, { sortCode: s.bank_sort_code, accountNumber: s.bank_account_number, name: s.bank_account_name ?? "" });
    filename = `bacs-${run.pay_date}.txt`;
  } else {
    body = paymentsCsv(payees);
    filename = `payments-${run.pay_date}.csv`;
  }
  return new NextResponse(body, {
    headers: {
      "Content-Type": format === "std18" ? "text/plain; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Lets the page warn about anyone left out of the file.
      "X-Excluded-Employees": encodeURIComponent(missing.join(", ")),
      "Cache-Control": "no-store",
    },
  });
}
