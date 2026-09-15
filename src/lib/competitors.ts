export type Competitor = {
  name: string;
  pricing: string;
  strength: string;
  weakness: string;
  bestFor: string;
};

export const COMPETITORS: Competitor[] = [
  {
    name: "Sage 50 / Sage Payroll",
    pricing: "Flat subscription",
    strength: "Tax compliance is genuinely solid, with a huge existing UK footprint.",
    weakness:
      "UI/UX built for desktop-era workflows — slow and dated. Its “AI” layer does close to nothing functionally.",
    bestFor: "Businesses that have already made peace with a dated interface in exchange for stability.",
  },
  {
    name: "Xero",
    pricing: "Subscription + per-active-employee add-on",
    strength: "Bundles PAYE, RTI and HMRC submission well, with a strong cloud-migration story.",
    weakness:
      "Deliberately locks you into its own ecosystem, produces reports that are hard to interpret, and has no AI variance detection at all. Xero-run accounts still need an accountant to hold them.",
    bestFor: "Businesses already fully on Xero for accounting who don't mind extending the lock-in to payroll.",
  },
  {
    name: "BrightPay",
    pricing: "Per client / per employee",
    strength: "Popular with microbusinesses specifically for its HMRC compliance.",
    weakness: "Still hasn't properly solved cloud migration, so it stays a microbusiness tool and doesn't scale cleanly.",
    bestFor: "Very small, single-site businesses that don't plan to grow past a handful of employees.",
  },
  {
    name: "PayFit",
    pricing: "Per employee, per month",
    strength: "A well-known all-in-one payslip and HR portal.",
    weakness:
      "Very hard to configure — a business without an already-standardised process can make the app fall over, at which point an accountant has to step in anyway. Pricing scales up with headcount, which growing businesses resent.",
    bestFor: "Businesses with a mature, standardised HR process already in place before they onboard.",
  },
  {
    name: "Employment Hero",
    pricing: "Per employee/month, premium tier for advanced HR + payroll",
    strength: "A broad feature set covering HR and payroll together.",
    weakness:
      "Hard to set up, over-featured with things most SMEs don't need, and reported customer service is poor. Because the product is so complex, problems can't be resolved by an accountant alone.",
    bestFor: "Larger SMEs with a dedicated HR function that can absorb the setup and support overhead.",
  },
  {
    name: "Rippling",
    pricing: "High baseline + per-employee/month",
    strength: "Genuinely cloud-native, with real mobile apps for employees.",
    weakness:
      "Heavy hidden costs and configuration overhead aimed at global/enterprise needs — overkill for a standard UK SME, and really built for businesses making international payments.",
    bestFor: "Multi-country businesses that need international payroll and payments, not a UK-only SME.",
  },
];

export const SECONDARY_COMPETITORS_NOTE =
  "Gusto and Deel/Papaya Global are strong products but are US-first or global-contractor-first respectively — neither is purpose-built around UK RTI, NEST or NMW mechanics, so they're a secondary threat rather than the primary battleground.";

export const MARKET_GAPS = [
  "Explain which specific rule a flagged item breaks, rather than just flagging that something looks off.",
  "Give HR, the employee, and the accountant a shared live view of the same payroll run, each scoped to what they're allowed to see.",
  "Catch problems mid-cycle, before the money has moved, instead of after.",
  "Auto-ingest messy, disconnected source data — time & attendance exports, receipts, spreadsheets — instead of requiring manual column-mapping.",
];
