import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { mtdAuthorizeUrl, mtdConfigProblem } from "@/lib/vat/mtd";

export async function GET(req: NextRequest) {
  const back = new URL("/dashboard/vat", req.nextUrl.origin);
  const problem = mtdConfigProblem();
  if (problem) {
    back.searchParams.set("error", problem);
    return NextResponse.redirect(back);
  }
  // CSRF protection for the OAuth round trip.
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(mtdAuthorizeUrl(req.nextUrl.origin, state));
  res.cookies.set("hmrc_vat_state", state, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", path: "/api/vat/hmrc", maxAge: 600 });
  return res;
}
