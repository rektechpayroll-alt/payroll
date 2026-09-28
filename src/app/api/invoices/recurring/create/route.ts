import { NextRequest } from "next/server";
import { jsonAction } from "@/lib/http";
import { createRecurring, type Frequency } from "@/lib/invoicing/service";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return jsonAction(async () => ({
    id: await createRecurring({
      customer_name: String(b?.customerName ?? ""),
      customer_email: typeof b?.customerEmail === "string" && b.customerEmail.trim() ? b.customerEmail.trim() : null,
      items: Array.isArray(b?.items)
        ? b.items.slice(0, 50).map((i: { description?: string; quantity?: number; unitPrice?: number }) => ({ description: String(i.description ?? ""), quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) }))
        : [],
      vat_rate: [20, 5, 0].includes(Number(b?.vatRate)) ? Number(b.vatRate) : 20,
      currency: ["GBP", "USD", "EUR", "AED"].includes(b?.currency) ? b.currency : "GBP",
      frequency: b?.frequency as Frequency,
      next_date: String(b?.firstDate ?? ""),
      end_date: typeof b?.endDate === "string" && b.endDate ? b.endDate : null,
      due_days: Math.max(0, Math.min(365, Math.floor(Number(b?.dueDays) || 30))),
      auto_send: b?.autoSend === true,
      notes: typeof b?.notes === "string" && b.notes.trim() ? b.notes.trim().slice(0, 500) : null,
    }),
  }));
}
