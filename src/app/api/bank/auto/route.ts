import { bankAction } from "@/lib/banking/api";
import { autoReconcile } from "@/lib/banking/bank";

export async function POST() {
  return bankAction(() => autoReconcile());
}
