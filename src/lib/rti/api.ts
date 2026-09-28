import { NextResponse } from "next/server";
import { PayRunError } from "@/lib/payroll/runs";
import { RtiError } from "./submissions";

export async function rtiAction(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (e) {
    if (e instanceof RtiError || e instanceof PayRunError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 });
  }
}

export function xmlDownload(xml: string, filename: string) {
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
