import { el, money, opt, type XmlNode } from "./xml";

/**
 * Full Payment Submission (FPS) 2026-27 — HMRC schema
 * http://www.govtalk.gov.uk/taxation/PAYE/RTI/FullPaymentSubmission/26-27/1
 * Pure: takes already-calculated figures, returns the <IRenvelope> for the GovTalk <Body>.
 * Element order follows the schema exactly (XSD sequences are order-sensitive).
 */

export const FPS_NAMESPACE = "http://www.govtalk.gov.uk/taxation/PAYE/RTI/FullPaymentSubmission/26-27/1";

export type EmployerRefs = { officeNo: string; payeRef: string; aoRef: string };

export type FpsEmployee = {
  nino: string | null;
  forename: string;
  surname: string;
  address: { lines: string[]; postcode: string | null } | null;
  birthDate: string | null;
  gender: "M" | "F";
  director: boolean;
  starter: { startDate: string; declaration: "A" | "B" | "C" | null; studentLoan: boolean; postgradLoan: boolean } | null;
  payId: string;
  leavingDate: string | null;
  ytd: {
    taxablePay: number;
    tax: number;
    studentLoan: number | null;
    postgradLoan: number | null;
    benefits: number;
    pensionNetPay: number;
    pensionNotNetPay: number;
    smp: number;
    spp: number;
    sap: number;
    shpp: number;
    spbp: number;
    sncp: number;
  };
  payment: {
    payFreq: "W1" | "W2" | "W4" | "M1";
    pmtDate: string;
    weekNo: number | null;
    monthNo: number | null;
    hoursBand: "A" | "B" | "C" | "D" | "E";
    taxCode: string; // e.g. 1257L, BR, K475 — no S/C prefix, no W1/M1/X suffix
    nonCumulative: boolean;
    regime: "S" | "C" | null;
    taxablePay: number;
    dednsFromNetPay: number;
    payAfterStatDedns: number;
    benefits: number;
    pensionNetPay: number;
    pensionNotNetPay: number;
    studentLoan: { plan: "01" | "02" | "04" | "05"; amount: number } | null;
    postgradLoan: number | null;
    tax: number;
    unpaidAbsence: boolean;
  };
  ni: {
    letter: string;
    grossPd: number;
    grossYtd: number;
    atLelYtd: number;
    lelToPtYtd: number;
    ptToUelYtd: number;
    employerPd: number;
    employerYtd: number;
    employeePd: number;
    employeeYtd: number;
  };
};

/** Names may only contain letters, spaces, hyphens and apostrophes; accents are transliterated. */
export function hmrcName(s: string, max = 35): string {
  const cleaned = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z \-']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^A-Za-z]+/, "");
  return cleaned.slice(0, max).trim();
}

const addressLine = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,\-()/=!"%&*;<>'+:?]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 35);

const whole = (n: number) => money(Math.trunc(n));
const nonZero = (name: string, v: number) => (v ? el(name, money(v)) : null);

function employee(e: FpsEmployee): XmlNode {
  const p = e.payment;
  const lines = e.address?.lines.map(addressLine).filter(Boolean).slice(0, 4) ?? [];
  return el("Employee", [
    el("EmployeeDetails", [
      opt("NINO", e.nino),
      el("Name", [el("Fore", hmrcName(e.forename)), el("Sur", hmrcName(e.surname))]),
      e.address && (lines.length || e.address.postcode)
        ? el("Address", [...lines.map((l) => el("Line", l)), opt("UKPostcode", e.address.postcode)])
        : null,
      opt("BirthDate", e.birthDate),
      el("Gender", e.gender),
    ]),
    el("Employment", [
      e.director ? el("DirectorsNIC", "AN") : null,
      e.starter
        ? el("Starter", [
            el("StartDate", e.starter.startDate),
            opt("StartDec", e.starter.declaration),
            e.starter.studentLoan ? el("StudentLoan", "yes") : null,
            e.starter.postgradLoan ? el("PostgradLoan", "yes") : null,
          ])
        : null,
      el("PayId", e.payId),
      opt("LeavingDate", e.leavingDate),
      el("FiguresToDate", [
        el("TaxablePay", money(Math.max(0, e.ytd.taxablePay))),
        el("TotalTax", money(e.ytd.tax)),
        e.ytd.studentLoan !== null ? el("StudentLoansTD", whole(e.ytd.studentLoan)) : null,
        e.ytd.postgradLoan !== null ? el("PostgradLoansTD", whole(e.ytd.postgradLoan)) : null,
        nonZero("BenefitsTaxedViaPayrollYTD", e.ytd.benefits),
        nonZero("EmpeePenContribnsPaidYTD", e.ytd.pensionNetPay),
        nonZero("EmpeePenContribnsNotPaidYTD", e.ytd.pensionNotNetPay),
      ]),
      el("Payment", [
        el("PayFreq", p.payFreq),
        el("PmtDate", p.pmtDate),
        p.weekNo !== null ? el("WeekNo", String(p.weekNo)) : el("MonthNo", String(p.monthNo)),
        el("PeriodsCovered", "1"),
        el("HoursWorked", p.hoursBand),
        el("TaxCode", { BasisNonCumulative: p.nonCumulative ? "yes" : undefined, TaxRegime: p.regime ?? undefined }, p.taxCode),
        el("TaxablePay", money(p.taxablePay)),
        nonZero("DednsFromNetPay", p.dednsFromNetPay),
        el("PayAfterStatDedns", money(p.payAfterStatDedns)),
        nonZero("BenefitsTaxedViaPayroll", p.benefits),
        nonZero("EmpeePenContribnsPaid", p.pensionNetPay),
        nonZero("EmpeePenContribnsNotPaid", p.pensionNotNetPay),
        p.studentLoan ? el("StudentLoanRecovered", { PlanType: p.studentLoan.plan }, whole(p.studentLoan.amount)) : null,
        p.postgradLoan !== null ? el("PostgradLoanRecovered", whole(p.postgradLoan)) : null,
        el("TaxDeductedOrRefunded", money(p.tax)),
        p.unpaidAbsence ? el("UnpaidAbsence", "yes") : null,
        nonZero("SMPYTD", e.ytd.smp),
        nonZero("SPPYTD", e.ytd.spp),
        nonZero("SAPYTD", e.ytd.sap),
        nonZero("ShPPYTD", e.ytd.shpp),
        nonZero("SPBPYTD", e.ytd.spbp),
        nonZero("SNCPYTD", e.ytd.sncp),
      ]),
      el("NIlettersAndValues", [
        el("NIletter", e.ni.letter),
        el("GrossEarningsForNICsInPd", money(e.ni.grossPd)),
        el("GrossEarningsForNICsYTD", money(Math.max(0, e.ni.grossYtd))),
        el("AtLELYTD", whole(e.ni.atLelYtd)),
        el("LELtoPTYTD", money(e.ni.lelToPtYtd)),
        el("PTtoUELYTD", money(e.ni.ptToUelYtd)),
        el("TotalEmpNICInPd", money(e.ni.employerPd)),
        el("TotalEmpNICYTD", money(Math.max(0, e.ni.employerYtd))),
        el("EmpeeContribnsInPd", money(e.ni.employeePd)),
        el("EmpeeContribnsYTD", money(Math.max(0, e.ni.employeeYtd))),
      ]),
    ]),
  ]);
}

export function buildFps(input: { relatedTaxYear: string; employer: EmployerRefs; employees: FpsEmployee[]; finalSubmissionForYear?: boolean }) {
  return {
    namespace: FPS_NAMESPACE,
    keys: { officeNo: input.employer.officeNo, payeRef: input.employer.payeRef },
    relatedTaxYear: input.relatedTaxYear,
    body: el("FullPaymentSubmission", [
      el("EmpRefs", [el("OfficeNo", input.employer.officeNo), el("PayeRef", input.employer.payeRef), el("AORef", input.employer.aoRef)]),
      el("RelatedTaxYear", input.relatedTaxYear),
      ...input.employees.map(employee),
      input.finalSubmissionForYear ? el("FinalSubmission", [el("ForYear", "yes")]) : null,
    ]),
  };
}
