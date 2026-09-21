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
    letter: "T",
    title: "Payroll run diff/audit view",
    summary: "A git-style diff between consecutive runs — exactly what changed per employee, and why.",
    detail:
      "Every run is compared employee-by-employee against the one before it: who joined, who left, whose pay moved and by how much, and which compliance flags appeared or cleared since last time — instead of a flat report someone has to compare by eye. Live on /dashboard/runs/diff, built from real payroll_runs and payroll_lines history rather than a mockup.",
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
    title: "Verity Ledger — invoicing & bank reconciliation",
    summary: "Sales invoicing and bank reconciliation, connected to the same Open Banking feed payroll already reconciles against.",
    detail:
      "Sage and Xero both start from accounting and treat payroll as an add-on; Verity does the opposite. Verity Ledger is the first real step the other way — raise and send invoices, and reconcile incoming payments against the connected bank feed with a one-click confirm on each suggested match, live and working at /dashboard/ledger rather than a mockup or marketing claim. It's deliberately named as its own product, the way Sage names Accounting and Payroll separately, rather than folded silently into the payroll app.",
    group: "Beyond payroll",
  },
  {
    letter: "U",
    title: "VAT & Making Tax Digital submission",
    summary: "Automatic VAT return calculation and direct HMRC MTD submission from Verity Ledger's invoice data. On the roadmap.",
    detail:
      "Verity Ledger already has the invoice and VAT-rate data a VAT return needs — what's missing is a real HMRC Making Tax Digital API connection to submit it through, the same bar Verity's RTI/NEST pipeline (pillar G) already clears for payroll. Building that against a live HMRC sandbox is the next step; a VAT calculator without a genuine submission path would be illustrative rather than working, so this stays an explicit roadmap item rather than a shipped feature.",
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
  {
    letter: "V",
    title: "Send Quotes",
    summary: "A quote a customer accepts converts straight into a real draft invoice, line items included.",
    detail:
      "Quoting is the sales-side precursor to invoicing — Xero and most accounting suites ship it as a separate feature that still has to be re-keyed into an invoice by hand once accepted. Verity Ledger's Quotes tab skips the re-keying: an accepted quote's customer, line items and VAT carry straight across into a new draft invoice with one click, live at /dashboard/ledger.",
    group: "Beyond payroll",
  },
  {
    letter: "W",
    title: "Accept Payments",
    summary: "A one-click “Pay by card” path on every sent invoice, alongside bank-transfer reconciliation.",
    detail:
      "Most invoicing tools offer a card payment link as their fast path to getting paid, next to the slower bank-transfer route that needs reconciling. Verity Ledger ships both: bank transfers still reconcile through the suggested-match engine (pillar S2), and a card payment marks the invoice paid immediately while dropping a matched credit onto the same bank feed — clearly labelled as a simulated charge, since a real card gateway isn't wired into this demo.",
    group: "Beyond payroll",
  },
  {
    letter: "X",
    title: "Pay Bills",
    summary: "Accounts payable alongside accounts receivable — supplier bills that reconcile against the same bank feed.",
    detail:
      "Invoicing (money coming in) is only half of Verity Ledger. Pay Bills is the other half: supplier bills tracked to due date, with a one-click “Pay bill” that drops a matched debit onto the connected bank feed — the same reconciliation architecture that already handles invoices and payroll's BACS run, applied to the purchasing side. Live at /dashboard/purchasing.",
    group: "Beyond payroll",
  },
  {
    letter: "Y",
    title: "Create Purchase Orders",
    summary: "Order from a supplier, then convert the received order straight into a bill — no re-keying the total twice.",
    detail:
      "A purchase order is the commitment; a bill is what actually gets paid. Verity's Purchase Orders convert directly into a Pay Bills entry once marked received, carrying the total and supplier across automatically — the buying-side mirror of the Quotes -> Invoice flow (pillar V).",
    group: "Beyond payroll",
  },
  {
    letter: "Z",
    title: "Manage Inventory",
    summary: "Stock tracking for what a lettings and management agency actually holds — signage, key fobs, welcome packs, equipment.",
    detail:
      "Not warehouse SKUs — the physical stock a property agency really carries: To Let and For Sale boards, branded key fobs, tenant welcome packs, key safes. Every adjustment logs a real movement rather than editing the quantity directly, so the stock count is always derived from an auditable ledger, and low-stock items are flagged automatically against a reorder level. Live at /dashboard/inventory.",
    group: "Beyond payroll",
  },
  {
    letter: "AA",
    title: "Claim Expenses",
    summary: "Submit, approve and reimburse — the working half of pillar F's expenses promise, with reimbursement reconciled against the bank feed.",
    detail:
      "Pillar F promised employees could upload expense receipts that reconcile automatically against bank transactions; this ships the real workflow behind that promise. An employee submits a claim, a manager approves or rejects it, and reimbursing it drops a debit onto the same connected bank feed Verity Ledger and Purchasing already use. Live at /dashboard/expenses.",
    group: "Beyond payroll",
  },
  {
    letter: "AB",
    title: "Mileage Tracking",
    summary: "Log a trip, get the HMRC AMAP-rate reimbursement calculated automatically — no spreadsheet.",
    detail:
      "Mileage claims are computed at the real HMRC Approved Mileage Allowance Payment rate (45p/mile for the first 10,000 business miles) the moment a trip is logged, rather than left for someone to calculate by hand at month end. Approval and reimbursement follow the same pattern as expense claims, sharing the /dashboard/expenses page as a second tab.",
    group: "Beyond payroll",
  },
  {
    letter: "AC",
    title: "Track Projects",
    summary: "Client work tracked against a budget — logged hours convert to cost at each project's hourly rate.",
    detail:
      "The same “budget headroom” idea the Profitability page already applies to payroll, extended to client project work: log hours against a project, and Verity converts them to cost at that project's hourly rate in real time, flagging anything that's gone over budget rather than leaving it to be discovered at invoicing time. Live at /dashboard/projects.",
    group: "Beyond payroll",
  },
  {
    letter: "AD",
    title: "Manage Contacts",
    summary: "One directory of every customer and supplier across Verity Ledger and Purchasing, each with a live balance.",
    detail:
      "Rather than a separate address book someone keeps in sync by hand, Contacts computes each customer's outstanding balance from open invoices and each supplier's from unpaid bills — live, matched against the same names those modules already store. Live at /dashboard/contacts.",
    group: "Beyond payroll",
  },
  {
    letter: "AE",
    title: "Multi-Currency Accounting",
    summary: "Invoice or bill in USD, EUR or AED — stored and reported in GBP, with the original foreign amount kept alongside.",
    detail:
      "A landlord client based in Dubai, or a European software supplier, doesn't invoice in GBP. Verity Ledger and Purchasing both support entering an invoice or bill in a foreign currency; the GBP-equivalent total is computed and stored (so every other report keeps working in one currency), while the original foreign amount stays visible for reference. FX rates are an illustrative fixed table, not a live feed — the same honesty pattern the rest of the demo's numbers already follow.",
    group: "Beyond payroll",
  },
  {
    letter: "AF",
    title: "Financial Reporting",
    summary: "A real Profit & Loss, computed live from Verity Ledger, Purchasing, payroll and Expenses — not a separate ledger.",
    detail:
      "Revenue from invoiced work, payroll's full cost to company, and Purchasing/expense outgoings roll up into a single P&L on demand, downloadable as CSV from the Reports page. Every figure traces back to a real row in a real module — there's no second set of books to keep reconciled.",
    group: "Beyond payroll",
  },
  {
    letter: "AG",
    title: "Accounting Dashboard",
    summary: "Bank balance, money owed to you and money you owe, at a glance on the main dashboard.",
    detail:
      "A compact snapshot — bank balance, AR outstanding, AP outstanding, net position — sits at the top of the payroll dashboard, each figure linking straight into the module that owns it (Cash Flow, Verity Ledger, Purchasing, Contacts). The same idea Xero's own dashboard leads with, but reading Verity's real data instead of a demo screenshot.",
    group: "Beyond payroll",
  },
  {
    letter: "AH",
    title: "Fixed Assets Management",
    summary: "A real asset register with straight-line depreciation, computed as of today rather than updated once a year.",
    detail:
      "Company vehicles, office IT, furniture and equipment are tracked with their purchase cost and useful life; net book value and accumulated depreciation are computed live rather than stored and going stale. Live at /dashboard/assets.",
    group: "Beyond payroll",
  },
  {
    letter: "AI",
    title: "Budgeting",
    summary: "Category budgets checked live against real spend across Purchasing and Expenses — no month-end reconciliation.",
    detail:
      "A budget line's “actual” is computed from real bills, expense claims, mileage and standalone categorised bank debits as they happen, not typed in from a spreadsheet at month end. Live at /dashboard/budget.",
    group: "Beyond payroll",
  },
  {
    letter: "AJ",
    title: "Cash Flow Forecasting",
    summary: "An AR/AP aging projection — real outstanding invoices and bills, plus the current payroll run's own cost.",
    detail:
      "The “Predictive cash-flow alerts tied to payroll” idea from the forward-looking list, now shipped: an aging-bucket forecast (overdue, next 30/60/90+ days) built from open invoices, unpaid bills, and the current payroll run's cost if its payday falls in range, with a running balance projected forward from the connected account. Live at /dashboard/cashflow.",
    group: "Beyond payroll",
  },
  {
    letter: "AK",
    title: "Real authentication & role-based login",
    summary: "This demo has no login system at all yet — every page is open. On the roadmap.",
    detail:
      "Pillar M promises enterprise SSO/SCIM at the 1,000+ tier, but that assumes a real authentication layer exists underneath it — this prototype currently has none; every dashboard page is reachable without signing in. Building real login (and the permissions that depend on it) is a foundational change, not a bolt-on, so it stays an explicit roadmap item rather than a faked “Log in” button that doesn't check anything.",
    group: "Beyond payroll",
  },
  {
    letter: "AL",
    title: "Smart document capture & file storage",
    summary: "Real OCR receipt/bill capture and document storage — needs a vision-model API and blob storage this demo doesn't wire up. On the roadmap.",
    detail:
      "The cross-system ingestion agent (pillar C) already auto-maps structured exports; genuinely reading a photographed receipt or a scanned bill needs a real vision-model call and somewhere durable to store the file, neither of which is wired into this prototype. Faking OCR with a text box that just pretends to “read” an image would break the honesty this project has kept everywhere else, so it stays roadmap.",
    group: "Beyond payroll",
  },
];
