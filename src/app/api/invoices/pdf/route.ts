import { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "@/lib/http";
import { invoicePdf } from "@/lib/invoicing/service";

export async function GET(req: NextRequest) {
  try {
    const { bytes, invoice } = await invoicePdf(req.nextUrl.searchParams.get("id") ?? "");
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${req.nextUrl.searchParams.get("download") ? "attachment" : "inline"}; filename="${invoice.invoice_number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
