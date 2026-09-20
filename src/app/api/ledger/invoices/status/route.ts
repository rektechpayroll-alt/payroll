import { NextRequest, NextResponse } from "next/server";
import { updateInvoiceStatus, type Invoice } from "@/lib/queries";

const VALID_STATUSES: Invoice["status"][] = ["draft", "sent", "paid", "void"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const status = body?.status as Invoice["status"] | undefined;

  if (!id || !status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "id and a valid status are required" }, { status: 400 });
  }

  const invoice = await updateInvoiceStatus(id, status);
  return NextResponse.json({ invoice });
}
