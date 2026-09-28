import { NextResponse } from "next/server";
import { BankError } from "./banking/bank";
import { LedgerError } from "./ledger/reports";
import { PayRunError } from "./payroll/runs";
import { RtiError } from "./rti/submissions";
import { VatError } from "./vat/returns";
import { InvoicingError } from "./invoicing/service";
import { InsightsError } from "./insights/data";
import { FxError } from "./fx/rates";
import { ProjectError } from "./projects/assert";
import { PaymentError } from "./payments/service";

/** Expected, user-facing problems become a 400 with their message; anything else is logged and a 500. */
export function errorResponse(e: unknown) {
  if (e instanceof VatError || e instanceof InvoicingError || e instanceof BankError || e instanceof LedgerError || e instanceof PayRunError || e instanceof RtiError || e instanceof InsightsError || e instanceof FxError || e instanceof ProjectError || e instanceof PaymentError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
}

export async function jsonAction(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
