import { NextRequest, NextResponse } from "next/server";
import { createContact, type Contact } from "@/lib/queries";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = body?.name as string | undefined;
  const type = body?.type as Contact["type"] | undefined;

  if (!name?.trim() || (type !== "customer" && type !== "supplier")) {
    return NextResponse.json({ error: "name and a valid type (customer or supplier) are required" }, { status: 400 });
  }

  const contact = await createContact({
    name: name.trim(),
    type,
    email: (body?.email as string | undefined)?.trim() || null,
    phone: (body?.phone as string | undefined)?.trim() || null,
  });
  return NextResponse.json({ contact });
}
