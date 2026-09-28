import { NextRequest, NextResponse } from "next/server";
import { completeMtdConnection } from "@/lib/vat/mtd";
import { VatError } from "@/lib/vat/returns";

export async function GET(req: NextRequest) {
  const back = new URL("/dashboard/vat", req.nextUrl.origin);
  const p = req.nextUrl.searchParams;
  const finish = (key: string, value: string) => {
    back.searchParams.set(key, value);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: "hmrc_vat_state", path: "/api/vat/hmrc" });
    return res;
  };
  if (p.get("error")) return finish("error", `HMRC connection cancelled (${p.get("error_description") ?? p.get("error")}).`);
  const code = p.get("code");
  if (!code || p.get("state") !== req.cookies.get("hmrc_vat_state")?.value) return finish("error", "HMRC sign-in expired — please connect again.");
  try {
    await completeMtdConnection(code, req.nextUrl.origin);
    return finish("connected", "1");
  } catch (e) {
    return finish("error", e instanceof VatError ? e.message : "Couldn't connect to HMRC.");
  }
}
