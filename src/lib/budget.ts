import type { BudgetLine, Bill, ExpenseClaim, MileageClaim, BankTransaction } from "./queries";

/**
 * Budgeting — actual spend per category, computed live from the same data every other
 * module already writes (bills, expense claims, mileage, and standalone categorised bank
 * debits), never a separate number someone has to update by hand.
 *
 * Bank transactions matched to a bill are excluded from the "standalone" sum below, since
 * that spend is already counted once via the bill itself — otherwise a paid bill would be
 * counted twice (once as a bill, once as the payment that settled it).
 */

export type BudgetLineWithActual = BudgetLine & {
  actual: number;
  variance: number;
  percentUsed: number;
  isOverBudget: boolean;
};

export function computeBudgetActuals(
  lines: BudgetLine[],
  bills: Bill[],
  expenseClaims: ExpenseClaim[],
  mileageClaims: MileageClaim[],
  bankTransactions: BankTransaction[]
): BudgetLineWithActual[] {
  return lines.map((line) => {
    let actual = bills.filter((b) => b.category === line.category).reduce((sum, b) => sum + b.total, 0);
    actual += expenseClaims.filter((c) => c.category === line.category).reduce((sum, c) => sum + c.amount, 0);
    if (line.category === "Travel & subsistence") {
      actual += mileageClaims.reduce((sum, m) => sum + m.amount, 0);
    }
    actual += bankTransactions
      .filter((t) => t.direction === "debit" && t.category === line.category && !t.matched_bill_id)
      .reduce((sum, t) => sum + t.amount, 0);

    actual = Math.round(actual * 100) / 100;
    const variance = Math.round((line.budgeted_amount - actual) * 100) / 100;
    const percentUsed = line.budgeted_amount > 0 ? (actual / line.budgeted_amount) * 100 : 0;
    return { ...line, actual, variance, percentUsed, isOverBudget: actual > line.budgeted_amount };
  });
}
