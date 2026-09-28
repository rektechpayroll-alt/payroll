import { randomUUID } from "node:crypto";
import { getPool, ready } from "@/lib/db";
import type { Employee } from "@/lib/queries";
import { currentCompanyId } from "@/lib/tenant";
import type { PensionScheme } from "./engine";
import { PayRunError } from "./runs";
import { ABSENCE_TYPES, type AbsenceType } from "./statutory";

/** Employee records and business settings the payroll engine and HMRC filings need. */

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export type Absence = {
  id: string;
  employee_id: string;
  type: AbsenceType;
  start_date: string;
  end_date: string;
  average_weekly_earnings: number | null;
  deduct_pay: boolean;
  notes: string | null;
};

export async function getAbsences(employeeId: string): Promise<Absence[]> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT id, employee_id, type, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date,
            average_weekly_earnings, deduct_pay, notes
     FROM absences WHERE employee_id = $1 AND company_id = $2 ORDER BY start_date DESC`,
    [employeeId, await currentCompanyId()]
  );
  return rows as Absence[];
}

export async function createAbsence(input: {
  employeeId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  averageWeeklyEarnings: number | null;
  deductPay: boolean;
  notes: string | null;
}): Promise<Absence> {
  await ready();
  const companyId = await currentCompanyId();
  if (!(input.type in ABSENCE_TYPES)) throw new PayRunError("Choose an absence type.");
  if (!isoDate.test(input.startDate) || !isoDate.test(input.endDate) || input.endDate < input.startDate) {
    throw new PayRunError("Enter a start date and an end date on or after it.");
  }
  if (input.averageWeeklyEarnings !== null && !(input.averageWeeklyEarnings >= 0 && input.averageWeeklyEarnings < 100_000)) {
    throw new PayRunError("Average weekly earnings must be a positive amount.");
  }
  const owned = await getPool().query("SELECT 1 FROM employees WHERE id = $1 AND company_id = $2", [input.employeeId, companyId]);
  if (!owned.rowCount) throw new PayRunError("Employee not found.");
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO absences (id, company_id, employee_id, type, start_date, end_date, average_weekly_earnings, deduct_pay, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, companyId, input.employeeId, input.type, input.startDate, input.endDate, input.averageWeeklyEarnings, input.deductPay, input.notes]
  );
  return (await getAbsences(input.employeeId)).find((a) => a.id === id)!;
}

export async function deleteAbsence(id: string): Promise<void> {
  await ready();
  const { rowCount } = await getPool().query("DELETE FROM absences WHERE id = $1 AND company_id = $2", [id, await currentCompanyId()]);
  if (!rowCount) throw new PayRunError("Absence not found.");
}

export type EmployeeRecordInput = {
  gender: "M" | "F" | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postcode: string | null;
  payrollId: string | null;
  starterDeclaration: "A" | "B" | "C" | null;
  workingDays: number[];
  payrolledBenefitsAnnual: number;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
};

/** Normalises and validates UK bank details: 6-digit sort code, 8-digit account number. */
export function normaliseBankDetails(sortCode: string | null, accountNumber: string | null) {
  const sc = sortCode?.replace(/[\s-]/g, "") || null;
  const acc = accountNumber?.replace(/\s/g, "") || null;
  if (!sc && !acc) return { sortCode: null, accountNumber: null };
  if (!sc || !/^\d{6}$/.test(sc)) throw new PayRunError("Sort code must be 6 digits.");
  if (!acc || !/^\d{7,8}$/.test(acc)) throw new PayRunError("Account number must be 8 digits.");
  return { sortCode: sc, accountNumber: acc.padStart(8, "0") };
}

export async function updateEmployeeRecord(id: string, input: EmployeeRecordInput): Promise<Employee> {
  await ready();
  const bank = normaliseBankDetails(input.bankSortCode, input.bankAccountNumber);
  const days = [...new Set(input.workingDays)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!days.length) throw new PayRunError("Pick at least one working day.");
  if (!(input.payrolledBenefitsAnnual >= 0 && input.payrolledBenefitsAnnual < 1_000_000)) throw new PayRunError("Check the benefits figure.");
  const postcode = input.postcode?.trim().toUpperCase() || null;
  if (postcode && !/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(postcode)) throw new PayRunError("That doesn't look like a UK postcode.");
  const { rows } = await getPool().query(
    `UPDATE employees SET gender = $1, address_line1 = $2, address_line2 = $3, postcode = $4, payroll_id = $5,
       starter_declaration = $6, working_days = $7, payrolled_benefits_annual = $8, bank_account_name = $9,
       bank_sort_code = $10, bank_account_number = $11
     WHERE id = $12 AND company_id = $13 RETURNING *`,
    [
      input.gender,
      input.addressLine1?.trim() || null,
      input.addressLine2?.trim() || null,
      postcode,
      input.payrollId?.trim() || null,
      input.starterDeclaration,
      days.join(","),
      input.payrolledBenefitsAnnual,
      input.bankAccountName?.trim() || null,
      bank.sortCode,
      bank.accountNumber,
      id,
      await currentCompanyId(),
    ]
  );
  if (!rows[0]) throw new PayRunError("Employee not found.");
  return rows[0] as Employee;
}

export type PayrollSettings = {
  paye_reference: string | null;
  accounts_office_reference: string | null;
  pension_scheme: PensionScheme;
  claim_employment_allowance: boolean;
  small_employer_relief: boolean;
  bank_account_name: string | null;
  bank_sort_code: string | null;
  bank_account_number: string | null;
  bacs_sun: string | null;
};

export async function getPayrollSettings(): Promise<PayrollSettings> {
  await ready();
  const { rows } = await getPool().query(
    `SELECT paye_reference, accounts_office_reference, pension_scheme, claim_employment_allowance, small_employer_relief,
            bank_account_name, bank_sort_code, bank_account_number, bacs_sun
     FROM companies WHERE id = $1`,
    [await currentCompanyId()]
  );
  return rows[0] as PayrollSettings;
}

export async function updatePayrollSettings(input: {
  payeReference: string | null;
  accountsOfficeReference: string | null;
  pensionScheme: PensionScheme;
  claimEmploymentAllowance: boolean;
  smallEmployerRelief: boolean;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
  bacsSun: string | null;
}): Promise<PayrollSettings> {
  await ready();
  const paye = input.payeReference?.replace(/\s/g, "").toUpperCase() || null;
  if (paye && !/^\d{3}\/[A-Z0-9]{1,10}$/.test(paye)) throw new PayRunError("Employer PAYE reference looks like 123/AB45678.");
  const ao = input.accountsOfficeReference?.replace(/\s/g, "").toUpperCase() || null;
  if (ao && !/^\d{3}P[A-Z]\d{7}[0-9X]$/.test(ao)) throw new PayRunError("Accounts Office reference looks like 123PA00012345.");
  const sun = input.bacsSun?.trim() || null;
  if (sun && !/^\d{6}$/.test(sun)) throw new PayRunError("A BACS Service User Number is 6 digits.");
  if (!["relief_at_source", "net_pay", "salary_sacrifice"].includes(input.pensionScheme)) throw new PayRunError("Choose a pension scheme type.");
  const bank = normaliseBankDetails(input.bankSortCode, input.bankAccountNumber);
  await getPool().query(
    `UPDATE companies SET paye_reference = $1, accounts_office_reference = $2, pension_scheme = $3, claim_employment_allowance = $4,
       small_employer_relief = $5, bank_account_name = $6, bank_sort_code = $7, bank_account_number = $8, bacs_sun = $9
     WHERE id = $10`,
    [paye, ao, input.pensionScheme, input.claimEmploymentAllowance, input.smallEmployerRelief, input.bankAccountName?.trim() || null, bank.sortCode, bank.accountNumber, sun, await currentCompanyId()]
  );
  return getPayrollSettings();
}
