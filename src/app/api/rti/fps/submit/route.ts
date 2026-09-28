import { NextRequest } from "next/server";
import { rtiAction } from "@/lib/rti/api";
import { prepareFps, RtiError, submitRti } from "@/lib/rti/submissions";
import { getPayRun } from "@/lib/payroll/runs";

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  return rtiAction(async () => {
    const runId = String(b?.runId ?? "");
    const run = await getPayRun(runId);
    if (!run) throw new RtiError("Pay run not found.");
    const { doc, problems } = await prepareFps(runId);
    if (problems.length) throw new RtiError(`Fix these before filing: ${problems.join(" ")}`);
    return {
      submission: await submitRti({
        kind: "FPS",
        runId,
        taxYear: run.tax_year!,
        taxMonth: run.frequency === "monthly" ? run.tax_period : null,
        doc,
        credentials: { senderId: String(b?.senderId ?? ""), password: String(b?.password ?? "") },
        testInLive: b?.testInLive !== false,
      }),
    };
  });
}
