import { NextResponse } from "next/server";
import { PayRunError } from "./runs";

/** Turns expected payroll errors into a 400 with a readable message; anything else is a 500. */
export async function payrollAction(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (e) {
    if (e instanceof PayRunError || (e instanceof Error && /rates|configured/.test(e.message))) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error(e);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}
