import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { updateVatSettings } from "@/lib/vat/returns";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() =>
    updateVatSettings({
      registered: b?.registered === true,
      vatNumber: typeof b?.vatNumber === "string" ? b.vatNumber : null,
      scheme: b?.scheme === "cash" ? "cash" : "accrual",
      stagger: ([1, 2, 3].includes(Number(b?.stagger)) ? Number(b.stagger) : 1) as 1 | 2 | 3,
    })
  );
}
