import type { Invoice, Bill, ExpenseClaim, MileageClaim, PayrollRun } from "./queries";

/**
 * Financial Reporting — a real Profit & Loss for the current period, computed from data
 * every other module already owns (Verity Ledger's invoices, Purchasing's bills, the
 * current payroll run's cost, and reimbursed expenses/mileage), not a separate ledger
 * someone has to keep in sync by hand.
 */

export type ProfitAndLoss = {
  revenue: number;
  payrollCost: number;
  operatingExpenses: {
    bills: number;
    expenseClaims: number;
    mileage: number;
    total: number;
  };
  netProfit: number;
};

export function computeProfitAndLoss(invoices: Invoice[], bills: Bill[], expenseClaims: ExpenseClaim[], mileageClaims: MileageClaim[], currentRun: PayrollRun | null): ProfitAndLoss {
  const revenue = invoices.filter((i) => i.status === "sent" || i.status === "paid").reduce((sum, i) => sum + i.total, 0);
  const payrollCost = currentRun ? currentRun.gross_pay + currentRun.employer_ni + currentRun.employer_pension : 0;
  const billsTotal = bills.filter((b) => b.status !== "void").reduce((sum, b) => sum + b.total, 0);
  const claimsTotal = expenseClaims.filter((c) => c.status === "approved" || c.status === "reimbursed").reduce((sum, c) => sum + c.amount, 0);
  const mileageTotal = mileageClaims.filter((m) => m.status === "approved" || m.status === "reimbursed").reduce((sum, m) => sum + m.amount, 0);
  const operatingTotal = Math.round((billsTotal + claimsTotal + mileageTotal) * 100) / 100;

  return {
    revenue: Math.round(revenue * 100) / 100,
    payrollCost: Math.round(payrollCost * 100) / 100,
    operatingExpenses: { bills: billsTotal, expenseClaims: claimsTotal, mileage: mileageTotal, total: operatingTotal },
    netProfit: Math.round((revenue - payrollCost - operatingTotal) * 100) / 100,
  };
}
