export type Pillar = {
  letter: string;
  title: string;
  summary: string;
  detail: string;
  group:
    | "Catch it before payday"
    | "Explain, don't escalate"
    | "One shared source of truth"
    | "Compliance that keeps up"
    | "See around corners"
    | "Built to scale"
    | "Built for the workforce, not just HR"
    | "Beyond payroll";
};

export const PILLARS: Pillar[] = [
  {
    letter: "A",
    title: "Deterministic core, AI variance layer",
    summary: "A deterministic calculation engine, backed by an AI anomaly detector — not a bolted-on chatbot.",
    detail:
      "The payroll calculation itself stays fully deterministic. Sitting behind it, an AI anomaly detector reviews every run and categorises each flagged item both by where it came from (bank & payments, compliance, tax & statutory, commission & variable pay) and by which specific rule was possibly broken — so the reviewer isn't left guessing why something was flagged.",
    group: "Catch it before payday",
  },
  {
    letter: "S",
    title: "Task-specific AI agents — Compliance, Reconciliation & Close",
    summary: "Verity's answer to Sage Copilot: three working agents scoped to real payroll tasks, not a general chatbot.",
    detail:
      "A Compliance Agent sweeps every employee for NMW and statutory-leave exceptions in one pass; a Reconciliation Agent groups every flagged line on the current run by category so a reviewer sees the shape of the problem; a Close Agent tracks the standing month-end checklist so a run is never signed off half-done. All three run against this account's real Postgres data on /dashboard/agents — they're a working feature, not a mockup.",
    group: "Catch it before payday",
  },
  {
    letter: "B",
    title: "Continuous Payroll Ledger",
    summary: "Mid-month preview runs catch anomalies before payday, not after.",
    detail:
      "Rather than a single end-of-month calculation, the ledger runs continuously, with scheduled preview runs mid-cycle. This directly kills the “anomaly discovered after the money has already left the account” failure mode that erodes employee trust in every incumbent.",
    group: "Catch it before payday",
  },
  {
    letter: "C",
    title: "Cross-system ingestion agent",
    summary: "Auto-maps CSVs, PDFs and time-and-attendance exports — no manual column mapping.",
    detail:
      "An AI-powered document and spreadsheet ingestion agent reads time-and-attendance exports (RotaCloud, Timetastic-style formats), PDFs and CSVs and maps them automatically, removing the single biggest source of manual entry error in UK payroll cycles.",
    group: "Catch it before payday",
  },
  {
    letter: "D",
    title: "Conversational Payslip Explainer",
    summary: "An HMRC-style income breakdown, in plain language, inside the app.",
    detail:
      "Employees get a proper breakdown of their own income and deductions without registering anywhere else. A spike in tax from overtime becomes self-explanatory instead of a support ticket landing on HR's desk.",
    group: "Explain, don't escalate",
  },
  {
    letter: "F",
    title: "Overtime, leave & expenses portal",
    summary: "Live status on overtime, leave approvals, and receipts reconciled against the bank feed automatically.",
    detail:
      "Employees see the live status of overtime and leave approvals and can upload expense receipts, which are then reconciled automatically against bank transactions rather than checked by hand.",
    group: "Explain, don't escalate",
  },
  {
    letter: "E",
    title: "One dashboard, three audiences",
    summary: "HR, employee, and accountant views of the same run, scoped to what each is allowed to see.",
    detail:
      "An HR dashboard and an employee dashboard feed into a dashboard visible to HR and the accountant, which rolls up into one view combining HR, employee and bank-statement data against HMRC compliance — and only that final, reconciled view triggers payroll authorisation. This removes the “manual accountancy comes again” step that quietly reappears in PayFit and Employment Hero once anything gets complicated.",
    group: "One shared source of truth",
  },
  {
    letter: "G",
    title: "Direct RTI + NEST pipeline",
    summary: "HMRC RTI (FPS/EPS) and NEST pension auto-enrolment, with threshold detection built in.",
    detail:
      "Submissions to HMRC go direct, and the moment an employee's earnings cross the auto-enrolment threshold, the app detects it and prompts enrolment under the new circumstances — no separate registration process for the business to manage.",
    group: "Compliance that keeps up",
  },
  {
    letter: "H",
    title: "Full statutory coverage",
    summary: "SSP, SMP, SPP, SAP, ShPP, NMW/age-banding and IR35 — built in, not bolted on.",
    detail:
      "Every statutory payment type and compliance band is part of the core, not an edge case — which is exactly where rigid competitors fail when HMRC changes a rule mid-cycle.",
    group: "Compliance that keeps up",
  },
  {
    letter: "J",
    title: "Flexible rules & workflow engine",
    summary: "Doesn't fall over for a business that doesn't already have a standard procedure.",
    detail:
      "Configurable rules and workflows mean the app adapts to how a business actually runs payroll today, rather than requiring a pre-existing standardised process — PayFit's specific, named failure mode.",
    group: "Compliance that keeps up",
  },
  {
    letter: "I",
    title: "“What if?” Payroll Simulator",
    summary: "The Profitability Index, extended into a forward-looking planning tool.",
    detail:
      "None of the incumbents offer anything like it — today they're all backward-looking compliance tools. Verity's simulator lets an owner model a new hire, a raise, or a bonus round before committing to it.",
    group: "See around corners",
  },
  {
    letter: "K",
    title: "Multi-entity consolidation",
    summary: "One parent view across subsidiaries, business units or payroll entities.",
    detail:
      "Group structures don't run one payroll — they run several, often on different schedules. Verity consolidates every entity into a single reconciled group view for finance, while each entity's own team keeps a scoped dashboard for just their headcount, so growth by acquisition or by opening a new legal entity doesn't mean bolting on a second system.",
    group: "Built to scale",
  },
  {
    letter: "L",
    title: "Role-based approval chains",
    summary: "Configurable multi-step sign-off with delegated approval and spend thresholds.",
    detail:
      "A 12-person business needs one approver; a 1,000-person one needs a chain — team lead, department head, finance — often with delegation when someone's on leave and different thresholds for who can approve what. Approval workflows are fully configurable per entity or department rather than hard-coded to a single owner.",
    group: "Built to scale",
  },
  {
    letter: "M",
    title: "Enterprise SSO & granular permissions",
    summary: "SAML/SSO login, SCIM provisioning, and field-level access scoped by role.",
    detail:
      "Single sign-on and automatic user provisioning through your identity provider, plus permissions scoped down to the field level — a department head sees their team's numbers, not the whole company's — so payroll access follows the same security model as the rest of your enterprise stack instead of living outside it.",
    group: "Built to scale",
  },
  {
    letter: "N",
    title: "Open API & HRIS sync",
    summary: "A documented REST API, webhooks, and native sync with Workday, BambooHR and iTrent.",
    detail:
      "Moving a 1,000-person org onto a new payroll system is a nonstarter if it means a rip-and-replace of the HRIS you already run. Verity syncs natively with the HR systems already in place and exposes a documented API and webhooks for anything custom, so payroll becomes another connected system rather than a second source of truth.",
    group: "Built to scale",
  },
  {
    letter: "O",
    title: "Digital contracts & e-signature onboarding",
    summary: "New starters sign their contract inside Verity — no separate HR tool for day one.",
    detail:
      "PayFit and HiBob both build contract creation, amendment and e-signing into their platform. Verity now ships the working half of this — a real, per-employee digital onboarding checklist (contract signed, right-to-work check, bank details, tax code) on every employee's record — with e-signature capture itself still on the roadmap.",
    group: "One shared source of truth",
  },
  {
    letter: "P",
    title: "Shift rostering & timesheet import",
    summary: "Build the rota, collect the hours, and feed both straight into payroll.",
    detail:
      "Employment Hero's rostering and shift-swap tools are a real strength for shift-based businesses, and it's a gap the cross-system ingestion agent (pillar C) only half-covers — ingestion assumes the rota already exists somewhere else. Verity closes the loop: build the rota, let staff swap shifts within rules, and the hours worked flow directly into the next run.",
    group: "Catch it before payday",
  },
  {
    letter: "Q",
    title: "On-demand wage access",
    summary: "Let employees draw down earned pay before payday, without a payday loan.",
    detail:
      "Of the six competitors reviewed, only Employment Hero (InstaPay) offers this today. Because Verity already runs a Continuous Payroll Ledger with live, up-to-the-day earned-wage figures (pillar B), it's positioned to offer this more accurately than a bolt-on — the ledger already knows exactly what's been earned, not an estimate.",
    group: "Built for the workforce, not just HR",
  },
  {
    letter: "R",
    title: "Statutory reporting automation",
    summary: "Gender Pay Gap and other mandatory UK filings, generated automatically, not built by hand every April.",
    detail:
      "UK employers with 250+ employees must publish Gender Pay Gap figures annually — a real, legally-mandated reporting burden that none of the six competitors reviewed surface prominently on their own site. Verity generates it directly from real payroll data instead of a spreadsheet exercise someone in HR redoes from scratch every year.",
    group: "Compliance that keeps up",
  },
  {
    letter: "S2",
    title: "Connected accounting ledger",
    summary: "Post approved payroll runs straight to a general ledger — invoicing, bank reconciliation and VAT/MTD, in one place with payroll. On the roadmap.",
    detail:
      "Sage and Xero both start from accounting and treat payroll as an add-on; Verity does the opposite today. The next step broadens the other way — a connected ledger, invoicing and Making Tax Digital VAT submission alongside payroll — so a business never has to reconcile two separate systems by hand. This is a directional roadmap item, not a shipped feature in this demo.",
    group: "Beyond payroll",
  },
  {
    letter: "S3",
    title: "Full HR suite",
    summary: "Org charts, a hiring pipeline, performance reviews and benefits administration alongside payroll and onboarding. On the roadmap.",
    detail:
      "The digital onboarding checklist (pillar O) is real and working today. The fuller HR layer competitors like HiBob and PayFit ship — org charts, applicant tracking, performance reviews, benefits administration — is the next planned extension, so Verity can be a single system of record for the whole employee lifecycle, not just the payroll run.",
    group: "Beyond payroll",
  },
];
