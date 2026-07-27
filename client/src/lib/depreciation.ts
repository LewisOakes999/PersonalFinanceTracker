/**
 * Display-only mirror of the server's depreciation rates
 * (server/src/lib/depreciation.ts), used to label the form before an asset
 * exists. The server is the source of truth and recomputes every value it
 * returns, so these numbers only ever affect wording, never money.
 */
export const DEPRECIATION_RATES: Record<string, number> = {
  vehicle: 0.15,
  other: 0.1,
  valuables: 0.02,
  property: 0,
  cash: 0,
};

export function depreciationRate(type: string): number {
  return DEPRECIATION_RATES[type] ?? 0;
}

export function canDepreciate(type: string): boolean {
  return depreciationRate(type) > 0;
}

/** e.g. "15% a year" for use in labels. */
export function ratePercent(type: string): string {
  return `${Math.round(depreciationRate(type) * 100)}% a year`;
}
