import { NextRequest, NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE, canAccessCompany } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const companyId = typeof body?.companyId === "string" ? body.companyId : "";
  if (!companyId || !(await canAccessCompany(companyId))) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
