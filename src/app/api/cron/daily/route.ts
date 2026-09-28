import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { refreshRates } from "@/lib/fx/rates";
import { runDailyJobs } from "@/lib/invoicing/service";

export const maxDuration = 300;

/**
 * Daily scheduled job (Vercel Cron → vercel.json). Vercel sends "Authorization: Bearer
 * $CRON_SECRET"; anything else is refused. Fetches exchange rates first (recurring invoices in
 * foreign currencies need them), then raises recurring invoices and sends reminders.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let rates: number | string;
  try {
    rates = await refreshRates();
  } catch (e) {
    rates = e instanceof Error ? e.message : "failed";
  }
  const summary = await runDailyJobs();
  return NextResponse.json({ ok: true, rates, businesses: summary.length, created: summary.reduce((s, x) => s + x.created, 0), reminders: summary.reduce((s, x) => s + x.reminders, 0), errors: summary.flatMap((x) => x.errors) });
}
