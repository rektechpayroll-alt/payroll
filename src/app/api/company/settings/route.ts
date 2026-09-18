import { NextRequest, NextResponse } from "next/server";
import { updateCompanySettings } from "@/lib/queries";

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.pay_schedule !== "string" || !["manual", "hybrid"].includes(body.approval_mode)) {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
  }
  const company = await updateCompanySettings({
    pay_schedule: body.pay_schedule,
    notify_on_flag: !!body.notify_on_flag,
    notify_on_approval: !!body.notify_on_approval,
    approval_mode: body.approval_mode,
  });
  return NextResponse.json({ company });
}
