import { jsonAction } from "@/lib/http";
import { disconnectMtd } from "@/lib/vat/mtd";

export async function POST() {
  return jsonAction(() => disconnectMtd());
}
