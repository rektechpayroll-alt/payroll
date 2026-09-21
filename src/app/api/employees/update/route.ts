import { NextRequest, NextResponse } from "next/server";
import { updateEmployee } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const role = body?.role as string | undefined;
  const email = body?.email as string | undefined;
  const employmentType = body?.employmentType as string | undefined;
  const taxCode = body?.taxCode as string | undefined;
  const niNumber = body?.niNumber as string | undefined;
  const weeklyHours = body?.weeklyHours as number | undefined;

  if (!id || !role?.trim() || !email?.trim() || !employmentType?.trim() || !taxCode?.trim() || !niNumber?.trim() || !(typeof weeklyHours === "number" && weeklyHours > 0)) {
    return NextResponse.json({ error: "id, role, email, employmentType, taxCode, niNumber and a positive weeklyHours are required" }, { status: 400 });
  }

  const employee = await updateEmployee(id, {
    role: role.trim(),
    email: email.trim(),
    employmentType: employmentType.trim(),
    taxCode: taxCode.trim(),
    niNumber: niNumber.trim(),
    weeklyHours,
  });
  return NextResponse.json({ employee });
}
