import { NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { paymentFile } from "@/lib/payments/service";

export async function GET(req: NextRequest) {
  try {
    const f = await paymentFile(req.nextUrl.searchParams.get("id") ?? "");
    return new Response(f.content, { headers: { "Content-Type": `${f.type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${f.filename}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
