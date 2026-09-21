import type { FixedAsset } from "./queries";

/** Fixed Assets Management — straight-line depreciation, computed on the fly rather than stored, so the register is always correct as of today. */

export type AssetWithDepreciation = FixedAsset & {
  annualDepreciation: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  percentDepreciated: number;
};

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

export function withDepreciation(asset: FixedAsset, today: Date = new Date()): AssetWithDepreciation {
  const purchased = new Date(asset.purchase_date);
  const yearsElapsed = Number.isNaN(purchased.getTime()) ? 0 : Math.max(0, (today.getTime() - purchased.getTime()) / MS_PER_YEAR);
  const annualDepreciation = asset.useful_life_years > 0 ? asset.purchase_cost / asset.useful_life_years : 0;
  const accumulatedDepreciation = Math.min(asset.purchase_cost, annualDepreciation * yearsElapsed);
  const netBookValue = Math.round((asset.purchase_cost - accumulatedDepreciation) * 100) / 100;
  const percentDepreciated = asset.purchase_cost > 0 ? (accumulatedDepreciation / asset.purchase_cost) * 100 : 0;
  return {
    ...asset,
    annualDepreciation: Math.round(annualDepreciation * 100) / 100,
    accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
    netBookValue,
    percentDepreciated,
  };
}

export type AssetRegisterSummary = { totalCost: number; totalNetBookValue: number; totalAccumulatedDepreciation: number };

export function summarizeAssets(assets: AssetWithDepreciation[]): AssetRegisterSummary {
  return {
    totalCost: assets.reduce((sum, a) => sum + a.purchase_cost, 0),
    totalNetBookValue: assets.reduce((sum, a) => sum + a.netBookValue, 0),
    totalAccumulatedDepreciation: assets.reduce((sum, a) => sum + a.accumulatedDepreciation, 0),
  };
}
