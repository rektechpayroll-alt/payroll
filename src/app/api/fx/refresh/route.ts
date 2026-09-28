import { jsonAction } from "@/lib/http";
import { refreshRates } from "@/lib/fx/rates";

export async function POST() {
  return jsonAction(async () => ({ days: await refreshRates() }));
}
