import { getCompany, getFixedAssets } from "@/lib/queries";
import { withDepreciation, summarizeAssets } from "@/lib/assets";
import { AssetsHub } from "@/components/AssetsHub";

export const dynamic = "force-dynamic";

export default async function AssetsPage() {
  const company = await getCompany();
  const assets = await getFixedAssets();
  const summary = summarizeAssets(assets.map((a) => withDepreciation(a)));

  return (
    <div>
      <div className="mb-[18px]">
        <h1 className="font-display text-[26px] font-semibold">Fixed assets</h1>
        <div className="mt-1 text-[13px] text-[var(--ink-secondary)]">
          {company.name} &middot; a real asset register with straight-line depreciation computed as of today, not a
          spreadsheet someone updates once a year at audit time.
        </div>
      </div>

      <AssetsHub initialAssets={assets} summary={summary} />
    </div>
  );
}
