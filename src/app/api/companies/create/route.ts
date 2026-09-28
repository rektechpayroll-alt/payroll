import { NextRequest, NextResponse } from "next/server";
import { createBusiness, PAY_SCHEDULES } from "@/lib/companies";
import { ACTIVE_COMPANY_COOKIE } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const paySchedule = PAY_SCHEDULES.find((p) => p === body?.paySchedule) ?? "Monthly";
  const employeeCount = Math.max(0, Math.min(100000, Math.floor(Number(body?.employeeCount) || 0)));
  if (name.length < 2 || name.length > 120) {
    return NextResponse.json({ error: "Enter your business name (2–120 characters)." }, { status: 400 });
  }

  const companyId = await createBusiness({ name, paySchedule, employeeCount, sampleData: body?.sampleData === true });
  const res = NextResponse.json({ companyId });
  res.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
