import type { EmployerRefs } from "./fps";
import { el, money } from "./xml";

/**
 * Employer Payment Summary (EPS) 2026-27 — tells HMRC about reductions to what the employer
 * owes: Employment Allowance, statutory pay recovered, or that nobody was paid this period.
 */

export const EPS_NAMESPACE = "http://www.govtalk.gov.uk/taxation/PAYE/RTI/EmployerPaymentSummary/26-27/1";

export type EpsInput = {
  relatedTaxYear: string;
  employer: EmployerRefs;
  noPaymentForPeriod?: { from: string; to: string };
  employmentAllowance?: boolean;
  /** Year-to-date recovered amounts for the given tax month, £. */
  recoverable?: {
    taxMonth: number;
    smp: number;
    spp: number;
    sap: number;
    shpp: number;
    spbp: number;
    sncp: number;
    /** Small Employers' Relief compensation on top of 100% recovery, by payment type. */
    compensation?: { smp: number; spp: number; sap: number; shpp: number; spbp: number; sncp: number };
  };
  finalSubmissionForYear?: boolean;
};

export function buildEps(input: EpsInput) {
  const r = input.recoverable;
  const c = r?.compensation;
  const amt = (name: string, v: number | undefined) => (v ? el(name, money(v)) : null);
  return {
    namespace: EPS_NAMESPACE,
    keys: { officeNo: input.employer.officeNo, payeRef: input.employer.payeRef },
    relatedTaxYear: input.relatedTaxYear,
    body: el("EmployerPaymentSummary", [
      el("EmpRefs", [el("OfficeNo", input.employer.officeNo), el("PayeRef", input.employer.payeRef), el("AORef", input.employer.aoRef)]),
      input.noPaymentForPeriod ? el("NoPaymentForPeriod", "yes") : null,
      input.noPaymentForPeriod ? el("NoPaymentDates", [el("From", input.noPaymentForPeriod.from), el("To", input.noPaymentForPeriod.to)]) : null,
      input.employmentAllowance !== undefined ? el("EmpAllceInd", input.employmentAllowance ? "yes" : "no") : null,
      r
        ? el("RecoverableAmountsYTD", [
            el("TaxMonth", String(r.taxMonth)),
            amt("SMPRecovered", r.smp),
            amt("SPPRecovered", r.spp),
            amt("SAPRecovered", r.sap),
            amt("ShPPRecovered", r.shpp),
            amt("SPBPRecovered", r.spbp),
            amt("SNCPRecovered", r.sncp),
            amt("NICCompensationOnSMP", c?.smp),
            amt("NICCompensationOnSPP", c?.spp),
            amt("NICCompensationOnSAP", c?.sap),
            amt("NICCompensationOnShPP", c?.shpp),
            amt("NICCompensationOnSPBP", c?.spbp),
            amt("NICCompensationOnSNCP", c?.sncp),
          ])
        : null,
      el("RelatedTaxYear", input.relatedTaxYear),
      input.finalSubmissionForYear ? el("FinalSubmission", [el("ForYear", "yes")]) : null,
    ]),
  };
}
