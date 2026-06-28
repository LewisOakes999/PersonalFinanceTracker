/**
 * Factor to convert a nominal value `monthIndex` months in the future into
 * today's money, given an annual inflation rate (%). 1 = no adjustment.
 */
export function realFactor(annualPct: number, monthIndex: number): number {
  if (!annualPct || annualPct <= 0) return 1;
  return 1 / Math.pow(1 + annualPct / 100, monthIndex / 12);
}
