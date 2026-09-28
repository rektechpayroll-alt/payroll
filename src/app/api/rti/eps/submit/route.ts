import { NextRequest } from "next/server";
import { rtiAction } from "@/lib/rti/api";
import { prepareEps, submitRti } from "@/lib/rti/submissions";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return rtiAction(async () => {
    const taxYear = String(b?.taxYear ?? "");
    const taxMonth = Number(b?.taxMonth);
    const { doc } = await prepareEps(taxYear, taxMonth, { noPayment: b?.noPayment === true });
    return {
      submission: await submitRti({
        kind: "EPS",
        runId: null,
        taxYear,
        taxMonth,
        doc,
        credentials: { senderId: String(b?.senderId ?? ""), password: String(b?.password ?? "") },
        testInLive: b?.testInLive !== false,
      }),
    };
  });
}
