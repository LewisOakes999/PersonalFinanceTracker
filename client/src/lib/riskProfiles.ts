// Friendly risk presets so users can pick what they roughly hold instead of
// guessing a volatility percentage. Figures are illustrative long-run *nominal*
// (GBP) averages — return = expected annual %, volatility = annual std-dev %.
export interface RiskProfile {
  id: string;
  label: string;
  return: number;
  volatility: number;
}

export const RISK_PROFILES: RiskProfile[] = [
  { id: "cash", label: "Cash / money market", return: 4, volatility: 1 },
  { id: "cautious", label: "Cautious — mostly bonds", return: 4.5, volatility: 6 },
  { id: "balanced", label: "Balanced — ~60% shares / 40% bonds", return: 6, volatility: 10 },
  { id: "growth", label: "Growth — mostly shares", return: 7, volatility: 14 },
  { id: "global", label: "Global shares — 100% equity tracker", return: 7.5, volatility: 16 },
  { id: "high", label: "Higher risk — single stocks / emerging", return: 9, volatility: 28 },
];

/** Match a return/volatility pair to a preset id, or "custom" if none fits. */
export function matchProfile(ret: number, vol: number): string {
  const hit = RISK_PROFILES.find((p) => p.return === ret && p.volatility === vol);
  return hit ? hit.id : "custom";
}

export function profileLabel(ret: number, vol: number): string {
  const id = matchProfile(ret, vol);
  return RISK_PROFILES.find((p) => p.id === id)?.label ?? "Custom";
}

/**
 * Plain-language read on a volatility: roughly two years in three land within
 * one standard deviation of the expected return.
 */
export function riskHint(ret: number, vol: number): string {
  if (vol <= 0) return "No variation assumed — grows at a steady rate.";
  const lo = Math.round(ret - vol);
  const hi = Math.round(ret + vol);
  return `Long-run average. In a typical year (about 2 in 3), the return swings between ${lo}% and ${hi}% — bigger swings happen, just less often.`;
}
