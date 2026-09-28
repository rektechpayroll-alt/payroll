import type { ProjectInput } from "@/lib/projects/service";

/** Reads a project form body; the service does the validation. */
export function projectInput(b: Record<string, unknown> | null): ProjectInput {
  return {
    name: String(b?.name ?? ""),
    clientName: String(b?.clientName ?? ""),
    billing: String(b?.billing ?? "hourly") as ProjectInput["billing"],
    hourlyRate: Number(b?.hourlyRate) || 0,
    fixedPrice: b?.fixedPrice === null || b?.fixedPrice === undefined || b?.fixedPrice === "" ? null : Number(b.fixedPrice),
    budget: Number(b?.budget) || 0,
    startDate: String(b?.startDate ?? ""),
    dueDate: b?.dueDate ? String(b.dueDate) : null,
  };
}
