export type Pillar = {
  letter: string;
  title: string;
  summary: string;
  detail: string;
  group: "Catch it before payday" | "Explain, don't escalate" | "One shared source of truth" | "Compliance that keeps up" | "See around corners";
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
];
