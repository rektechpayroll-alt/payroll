import { NextResponse } from "next/server";
import { BankError } from "./bank";

export async function bankAction(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (e) {
    if (e instanceof BankError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}
