/**
 * Depreciation is derived from the asset's type, never chosen by the user —
 * left to personal preference people tend to pick a flattering rate, which
 * would quietly inflate net worth.
 *
 * Rates are annual reducing-balance (each year takes a percentage of what's
 * left, not of the original), which matches how second-hand values actually
 * behave: steep early losses that taper off.
 */
export const DEPRECIATION_RATES: Record<string, number> = {
  // Cars/vans lose roughly 15–20% a year after the first-year drop; 15% is the
  // conservative end of the usual UK range.
  vehicle: 0.15,
  // Furniture, equipment and similar wear out steadily.
  other: 0.1,
  // Jewellery, art and collectables broadly hold value; a token rate only.
  valuables: 0.02,
  // Land and buildings aren't written down — they track the market instead, so
  // update the value directly rather than depreciating it.
  property: 0,
  // Cash is nominally unchanged (inflation is handled separately in forecasts).
  cash: 0,
};

/** Annual reducing-balance rate for an asset type (0 = doesn't depreciate). */
export function depreciationRate(type: string): number {
  return DEPRECIATION_RATES[type] ?? 0;
}

/** Whether depreciation is meaningful for this type — drives the UI tick box. */
export function canDepreciate(type: string): boolean {
  return depreciationRate(type) > 0;
}

/**
 * Value after reducing-balance depreciation between `from` and `asOf`.
 * Fractional years are handled continuously, so the value doesn't jump on an
 * anniversary. Never returns less than zero.
 */
export function depreciatedValue({
  value,
  type,
  depreciates,
  from,
  asOf = new Date(),
}: {
  value: number;
  type: string;
  depreciates: boolean;
  from?: Date | null;
  asOf?: Date;
}): number {
  const rate = depreciationRate(type);
  if (!depreciates || rate <= 0 || !from) return value;
  const years = (asOf.getTime() - new Date(from).getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
  if (years <= 0) return value;
  const remaining = value * Math.pow(1 - rate, years);
  return Math.max(0, Math.round(remaining * 100) / 100);
}
