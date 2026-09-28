import { bankAction } from "@/lib/banking/api";
import { setOpeningBalanceFromStatement } from "@/lib/banking/bank";

export async function POST() {
  return bankAction(() => setOpeningBalanceFromStatement());
}
