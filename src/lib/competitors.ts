export type Competitor = {
  name: string;
  pricing: string;
  targetCustomer: string;
  features: string[];
  strength: string;
  weakness: string;
  bestFor: string;
};

export const COMPETITORS: Competitor[] = [
  {
    name: "Xero",
    pricing: "£18–£70/mo (accounting plans) + per-person payroll add-on",
    targetCustomer: "Self-employed through medium-sized businesses, across most industries",
    features: [
      "Invoicing, bank reconciliation, bill payment",
      "VAT returns & Making Tax Digital compliance",
      "Online payroll with CIS subcontractor calculations",
      "Cash flow forecasting & budgeting",
      "JAX — an AI \"finance partner\" for task automation and insights",
      "1,000+ app marketplace (Xero App Store)",
    ],
    strength: "Bundles PAYE, RTI and HMRC submission well inside a strong, well-known accounting platform with a huge app ecosystem.",
    weakness:
      "Payroll is a bolt-on to accounting, not the product — no anomaly detection, reports that are hard to interpret, and an accountant is still needed to hold the account. JAX assists bookkeeping, not payroll exceptions.",
    bestFor: "Businesses already fully on Xero for accounting who don't mind extending the lock-in to payroll.",
  },
  {
    name: "BrightPay",
    pricing: "Annual licence, per-client tiers (bureau pricing on a calculator page)",
    targetCustomer: "Accountancy bureaus running multiple clients, and single-company small employers",
    features: [
      "RTI (FPS/EPS) submission, HMRC-recognised",
      "Auto-enrolment with smart alerts",
      "Unlimited free payslips",
      "Employee self-service portal (payslips, leave calendar)",
      "Bureau batch processing across multiple clients at once",
      "Accounting sync with BrightBooks, Xero, Sage, QuickBooks",
    ],
    strength: "Deep, genuinely solid HMRC/RTI/auto-enrolment compliance, and processes at real bureau scale (3.5M employees/month across its base).",
    weakness:
      "Its own cloud migration is still framed as a work-in-progress choice ('the future') alongside a legacy desktop product — no AI anomaly layer, and no forward-looking planning tools.",
    bestFor: "Accountancy bureaus and small employers who want proven compliance and don't need automation beyond the payslip run.",
  },
  {
    name: "PayFit",
    pricing: "Per employee, per month (figures not publicly disclosed)",
    targetCustomer: "Small businesses (up to ~25 employees) through mid-market and 1,000+ employee enterprises",
    features: [
      "Payroll processing, RTI submission, NI/PAYE calculations",
      "Leave & absence management",
      "Employee contracts — creation, amendment, digital signing",
      "Onboarding/leaver workflows",
      "Performance reviews & employee surveys",
      "Payfit AI — a 24/7 payroll/HR agent for anomaly alerts and routine tasks",
      "50+ integrations (Xero, QuickBooks, BambooHR, Slack, NEST, and others)",
    ],
    strength:
      "A genuinely broad all-in-one payslip, HR and performance platform, now with an AI agent layer and (distinctively) a managed-service model where PayFit's own experts take legal responsibility for the payroll they run.",
    weakness:
      "Very hard to configure — a business without an already-standardised process can make the app fall over, at which point a human has to step in anyway. Per-employee pricing scales up with headcount with no visible ceiling, which growing businesses resent.",
    bestFor: "Businesses with a mature, standardised HR process already in place who want a managed payroll service, not just software.",
  },
  {
    name: "Employment Hero",
    pricing: "Per employee/month, premium tier for advanced HR + payroll (figures not public)",
    targetCustomer: "Small and medium-sized UK businesses",
    features: [
      "Automated pay runs from approved timesheets, real-time",
      "InstaPay — on-demand wage access before payday",
      "Rostering & shift management, with shift swapping/bidding",
      "Online timesheets with approval and import",
      "Automatic leave accrual and balance tracking",
      "Employee self-service, digital contracts and e-signing",
      "HMRC RTI reporting",
    ],
    strength:
      "One of the few in this list with a real early-wage-access feature (InstaPay), plus genuinely integrated rostering/shift management most payroll-first tools don't touch.",
    weakness:
      "Hard to set up, over-featured with things most SMEs don't need, and reported customer service is poor. Because the product is so complex, problems can't be resolved by an accountant alone.",
    bestFor: "Larger SMEs with shift-based staff and a dedicated HR function that can absorb the setup and support overhead.",
  },
  {
    name: "Rippling",
    pricing: "High baseline + per-employee/month (figures not public)",
    targetCustomer: "From small UK teams (2+ employees) up to large, globally distributed workforces",
    features: [
      "Payroll, benefits administration, expense management",
      "IT device and app management alongside HR",
      "Global compliance automation & multi-currency payroll",
      "Contractor management across countries",
      "Pre-built workflow automation templates",
    ],
    strength: "Genuinely unifies HR, IT and Finance data in one system — a real architectural advantage for a business already juggling separate tools for each.",
    weakness:
      "Heavy hidden costs and configuration overhead aimed at global/enterprise needs — overkill for a standard UK-only business, and its core differentiator (unifying IT device management with payroll) isn't a UK payroll problem at all.",
    bestFor: "Multi-country businesses that need international payroll, device management and payments together — not a UK-only business.",
  },
  {
    name: "HiBob (Bob)",
    pricing: "Not public — quote-based",
    targetCustomer: "Startups through enterprise; 5,000+ companies on the platform",
    features: [
      "Core HRIS, org chart, document management & eSign",
      "Hiring, onboarding, performance reviews & calibration",
      "Learning management & skills tracking",
      "UK & US payroll, time tracking, benefits administration",
      "Workforce & headcount planning, compensation benchmarking (via Mercer)",
      "A connected Finance module — 3-statement models, variance analysis",
      "Bob AI — embedded across the platform, plus a natural-language query and chat interface",
      "150+ metrics across 35+ analytics dashboards",
    ],
    strength:
      "The most complete HR platform of the group by far — payroll is one module inside a genuinely deep people-analytics, compensation-planning and finance-connected suite, with heavy analyst recognition (#1 G2 HR software).",
    weakness:
      "Payroll is not the product — it's one module in a sprawling HR suite, so it inherits general-HRIS complexity rather than being built payroll-first. 150+ metrics across 35 dashboards is analytics depth most SMEs will never use, and pricing requires a sales conversation.",
    bestFor: "Mid-market and enterprise businesses that want a single HR system of record with payroll as one module among many — not a business that wants payroll to be the primary, deeply-tuned product.",
  },
];

export const SECONDARY_COMPETITORS_NOTE =
  "Gusto and Deel/Papaya Global are strong products but are US-first or global-contractor-first respectively — neither is purpose-built around UK RTI, NEST or NMW mechanics, so they're a secondary threat rather than the primary battleground. Sage 50/Sage Payroll remains the desktop-era incumbent: tax compliance is solid, its UI is not, and its \"AI\" layer does close to nothing functionally.";

export const MARKET_GAPS = [
  "Explain which specific rule a flagged item breaks, rather than just flagging that something looks off.",
  "Give HR, the employee, and the accountant a shared live view of the same payroll run, each scoped to what they're allowed to see.",
  "Catch problems mid-cycle, before the money has moved, instead of after.",
  "Auto-ingest messy, disconnected source data — time & attendance exports, receipts, spreadsheets — instead of requiring manual column-mapping.",
  "Automate the UK-specific statutory reporting that's a legal requirement at scale (like Gender Pay Gap reporting for 250+ employee employers) instead of leaving it as a manual spreadsheet exercise every April.",
  "Make payroll the primary, deeply-tuned product rather than one module in a sprawling HR suite (HiBob) or a bolt-on to accounting software (Xero) or IT/device management (Rippling).",
];
