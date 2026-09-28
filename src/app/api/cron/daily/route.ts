import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runDailyJobs } from "@/lib/invoicing/service";

export const maxDuration = 300;

/**
 * Daily scheduled job (Vercel Cron → vercel.json). Vercel sends "Authorization: Bearer
 * $CRON_SECRET"; anything else is refused. Raises recurring invoices and sends reminders.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runDailyJobs();
  return NextResponse.json({ ok: true, businesses: summary.length, created: summary.reduce((s, x) => s + x.created, 0), reminders: summary.reduce((s, x) => s + x.reminders, 0), errors: summary.flatMap((x) => x.errors) });
}
