"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-actions";

const btn = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-[12.5px] font-semibold hover:bg-[var(--surface-2)] disabled:opacity-50";
const primary = "rounded-lg bg-[var(--accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] disabled:opacity-50";
const input = "rounded-lg border border-[var(--border-strong)] bg-[var(--surface-2)] px-2.5 py-1.5 text-[12.5px] text-[var(--ink)]";
const label = "flex flex-col gap-1 text-[11.5px] font-semibold text-[var(--ink-secondary)]";
const today = () => new Date().toISOString().slice(0, 10);

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async (url: string, body: unknown): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    const res = await postJson(url, body);
    setBusy(false);
    if (res) router.refresh();
    return res;
  };
  return { busy, run, router };
}

export type ProjectFormValues = {
  id?: string;
  name: string;
  clientName: string;
  billing: "hourly" | "fixed" | "non_billable";
  hourlyRate: string;
  fixedPrice: string;
  budget: string;
  startDate: string;
  dueDate: string;
};

export function ProjectForm({ initial, onDone }: { initial?: ProjectFormValues; onDone?: () => void }) {
  const { busy, run, router } = useAction();
  const [open, setOpen] = useState(!!initial);
  const [f, setF] = useState<ProjectFormValues>(
    initial ?? { name: "", clientName: "", billing: "hourly", hourlyRate: "", fixedPrice: "", budget: "", startDate: today(), dueDate: "" }
  );
  const set = (p: Partial<ProjectFormValues>) => setF((x) => ({ ...x, ...p }));
  if (!open) return <button className={primary} onClick={() => setOpen(true)}>New project</button>;
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className={label}>
          Project name
          <input className={input} value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className={label}>
          Client
          <input className={input} value={f.clientName} onChange={(e) => set({ clientName: e.target.value })} />
        </label>
        <label className={label}>
          Billing
          <select className={input} value={f.billing} onChange={(e) => set({ billing: e.target.value as ProjectFormValues["billing"] })}>
            <option value="hourly">Hourly — time and costs</option>
            <option value="fixed">Fixed price</option>
            <option value="non_billable">Not billed (internal)</option>
          </select>
        </label>
        {f.billing === "hourly" && (
          <label className={label}>
            Hourly rate you charge (£)
            <input className={`${input} font-num`} inputMode="decimal" value={f.hourlyRate} onChange={(e) => set({ hourlyRate: e.target.value })} />
          </label>
        )}
        {f.billing === "fixed" && (
          <label className={label}>
            Fixed price (£, excl. VAT)
            <input className={`${input} font-num`} inputMode="decimal" value={f.fixedPrice} onChange={(e) => set({ fixedPrice: e.target.value })} />
          </label>
        )}
        <label className={label}>
          Cost budget (£)
          <input className={`${input} font-num`} inputMode="decimal" value={f.budget} onChange={(e) => set({ budget: e.target.value })} />
        </label>
        <label className={label}>
          Start
          <input type="date" className={`${input} font-num`} value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </label>
        <label className={label}>
          Due (optional)
          <input type="date" className={`${input} font-num`} value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          className={primary}
          disabled={busy}
          onClick={async () => {
            const body = { ...f, hourlyRate: Number(f.hourlyRate) || 0, fixedPrice: f.fixedPrice ? Number(f.fixedPrice) : null, budget: Number(f.budget) || 0, dueDate: f.dueDate || null };
            const res = await run(initial?.id ? "/api/projects/update" : "/api/projects/create", body);
            if (!res) return;
            if (initial?.id) onDone?.();
            else if (typeof res.id === "string") router.push(`/dashboard/projects/${res.id}`);
          }}
        >
          {initial?.id ? "Save changes" : "Create project"}
        </button>
        <button
          className={btn}
          onClick={() => {
            if (initial) onDone?.();
            else setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function EditProject({ values }: { values: ProjectFormValues }) {
  const [editing, setEditing] = useState(false);
  if (!editing) return <button className={btn} onClick={() => setEditing(true)}>Edit project</button>;
  return (
    <div className="w-full">
      <ProjectForm initial={values} onDone={() => setEditing(false)} />
    </div>
  );
}

export function StatusSelect({ id, status }: { id: string; status: string }) {
  const { busy, run } = useAction();
  return (
    <select className={input} disabled={busy} value={status} onChange={(e) => run("/api/projects/status", { id, status: e.target.value })} aria-label="Project status">
      <option value="active">Active</option>
      <option value="on_hold">On hold</option>
      <option value="completed">Completed</option>
    </select>
  );
}

export function TimeForm({ projectId, employees, billable }: { projectId: string; employees: Array<{ id: string; name: string; costRate: number }>; billable: boolean }) {
  const { busy, run } = useAction();
  const [f, setF] = useState({ employeeId: employees[0]?.id ?? "", date: today(), hours: "", billable, note: "" });
  if (!employees.length) return <div className="text-[12.5px] text-[var(--ink-muted)]">Add people in Employees to log their time.</div>;
  const who = employees.find((e) => e.id === f.employeeId);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <select className={input} value={f.employeeId} onChange={(e) => setF({ ...f, employeeId: e.target.value })}>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      <input type="date" className={`${input} font-num`} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <input className={`${input} font-num w-[80px]`} placeholder="Hours" inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
      <input className={`${input} w-[200px]`} placeholder="What was done (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      {billable && (
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} />
          Billable
        </label>
      )}
      <button
        className={primary}
        disabled={busy || !f.hours}
        onClick={async () => {
          if (await run("/api/projects/time/create", { projectId, ...f, hours: Number(f.hours) })) setF({ ...f, hours: "", note: "" });
        }}
      >
        Log time
      </button>
      {who && <span className="text-[11.5px] text-[var(--ink-muted)]">costs £{who.costRate.toFixed(2)}/hour incl. employer NI and pension</span>}
    </div>
  );
}

export function CostForm({ projectId, billable }: { projectId: string; billable: boolean }) {
  const { busy, run } = useAction();
  const [f, setF] = useState({ date: today(), description: "", amount: "", billable, markupPct: "" });
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
      <input type="date" className={`${input} font-num`} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
      <input className={`${input} w-[200px]`} placeholder="e.g. Materials, subcontractor" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <input className={`${input} font-num w-[110px]`} placeholder="£ excl. VAT" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
      {billable && (
        <>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={f.billable} onChange={(e) => setF({ ...f, billable: e.target.checked })} />
            Recharge to client
          </label>
          {f.billable && <input className={`${input} font-num w-[90px]`} placeholder="Markup %" inputMode="decimal" value={f.markupPct} onChange={(e) => setF({ ...f, markupPct: e.target.value })} />}
        </>
      )}
      <button
        className={primary}
        disabled={busy || !f.description || !f.amount}
        onClick={async () => {
          if (await run("/api/projects/costs/create", { projectId, ...f, amount: Number(f.amount), markupPct: Number(f.markupPct) || 0 })) setF({ ...f, description: "", amount: "", markupPct: "" });
        }}
      >
        Add cost
      </button>
      <span className="text-[11.5px] text-[var(--ink-muted)]">Bills and expense claims charged to this project are added automatically.</span>
    </div>
  );
}

export function RemoveButton({ url, id }: { url: string; id: string }) {
  const { busy, run } = useAction();
  return (
    <button className="rounded-md px-1.5 text-[11.5px] font-semibold text-[var(--ink-secondary)] hover:bg-[var(--surface-2)]" disabled={busy} onClick={() => run(url, { id })}>
      Remove
    </button>
  );
}

export function InvoiceProject({ projectId, billing, unbilled, leftToInvoice }: { projectId: string; billing: string; unbilled: number; leftToInvoice: number | null }) {
  const { busy, run, router } = useAction();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [vatRate, setVatRate] = useState("20");
  const go = async (body: Record<string, unknown>) => {
    const res = await run("/api/projects/invoice", { projectId, vatRate: Number(vatRate), ...body });
    if (res) router.push("/dashboard/ledger");
  };
  const vat = (
    <select className={input} value={vatRate} onChange={(e) => setVatRate(e.target.value)} aria-label="VAT">
      <option value="20">VAT 20%</option>
      <option value="5">VAT 5%</option>
      <option value="0">No VAT</option>
    </select>
  );
  if (billing === "hourly") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        {vat}
        <button className={primary} disabled={busy || unbilled <= 0} onClick={() => go({})}>
          Invoice £{unbilled.toFixed(2)} of unbilled work
        </button>
        <span className="text-[11.5px] text-[var(--ink-muted)]">Creates a draft invoice to check and send.</span>
      </div>
    );
  }
  if (billing === "fixed") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <input className={`${input} w-[200px]`} placeholder="Stage, e.g. Deposit 30%" value={description} onChange={(e) => setDescription(e.target.value)} />
        <input className={`${input} font-num w-[110px]`} placeholder="£ excl. VAT" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        {vat}
        <button className={primary} disabled={busy || !amount} onClick={() => go({ amount: Number(amount), description })}>
          Invoice stage
        </button>
        <span className="text-[11.5px] text-[var(--ink-muted)]">£{(leftToInvoice ?? 0).toFixed(2)} of the price left to invoice</span>
      </div>
    );
  }
  return <div className="text-[12.5px] text-[var(--ink-muted)]">Internal project — not billed to a client.</div>;
}
