import { NextRequest, NextResponse } from "next/server";
import { createEmployee } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = body?.name as string | undefined;
  const role = body?.role as string | undefined;
  const email = body?.email as string | undefined;
  const employmentType = body?.employmentType as string | undefined;
  const startDate = body?.startDate as string | undefined;
  const taxCode = body?.taxCode as string | undefined;
  const niNumber = body?.niNumber as string | undefined;
  const weeklyHours = body?.weeklyHours as number | undefined;

  if (!name?.trim() || !role?.trim() || !email?.trim() || !employmentType?.trim() || !startDate?.trim() || !(typeof weeklyHours === "number" && weeklyHours > 0)) {
    return NextResponse.json({ error: "name, role, email, employmentType, startDate and a positive weeklyHours are required" }, { status: 400 });
  }

  const employee = await createEmployee({
    name: name.trim(),
    role: role.trim(),
    email: email.trim(),
    employmentType: employmentType.trim(),
    startDate: startDate.trim(),
    taxCode: taxCode?.trim() || "1257L",
    niNumber: niNumber?.trim() || "TBC",
    weeklyHours,
  });
  return NextResponse.json({ employee });
}
