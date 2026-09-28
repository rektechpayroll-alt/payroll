import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { updateCompanyProfile } from "@/lib/invoicing/service";

const s = (v: unknown) => (typeof v === "string" ? v : null);

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(() =>
    updateCompanyProfile({
      name: String(b?.name ?? ""),
      address_line1: s(b?.addressLine1),
      address_line2: s(b?.addressLine2),
      city: s(b?.city),
      postcode: s(b?.postcode),
      contact_email: s(b?.contactEmail),
      phone: s(b?.phone),
      company_number: s(b?.companyNumber),
      payment_terms_days: Number(b?.paymentTermsDays ?? 30),
      reminders_enabled: b?.remindersEnabled !== false,
      reminder_days: String(b?.reminderDays ?? "1,7,14,30"),
    })
  );
}
