/**
 * Monte Carlo projection of an investment pot under geometric Brownian motion
 * (lognormal monthly returns), with regular contributions. Returns per-month
 * percentile bands plus end-of-horizon summary statistics.
 */

// Deterministic PRNG so the same inputs always yield the same cone.
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box–Muller.
function randn(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

export interface MonteCarloParams {
  startingValue: number;
  monthlyContribution: number;
  expectedReturnPct: number; // annual, e.g. 7 for 7%
  volatilityPct: number; // annual std dev, e.g. 15
  months: number;
  simulations?: number;
  target?: number | null;
}

export interface MonteCarloResult {
  months: { monthIndex: number; p10: number; p25: number; p50: number; p75: number; p90: number; invested: number }[];
  summary: {
    finalP10: number;
    finalP25: number;
    finalP50: number;
    finalP75: number;
    finalP90: number;
    finalMean: number;
    totalContributed: number;
    invested: number; // starting + all contributions
    medianProfit: number;
    probProfit: number; // P(final >= invested)
    probTarget: number | null;
  };
}

export function monteCarlo(params: MonteCarloParams): MonteCarloResult {
  const {
    startingValue,
    monthlyContribution,
    expectedReturnPct,
    volatilityPct,
    months,
    simulations = 2000,
    target = null,
  } = params;

  const mu = expectedReturnPct / 100;
  const sigma = volatilityPct / 100;
  const sMonth = sigma / Math.sqrt(12);
  const monthlyExpSimple = Math.pow(1 + mu, 1 / 12) - 1;
  // Drift so that E[monthly simple return] matches the target expected return.
  const mMonth = Math.log(1 + monthlyExpSimple) - (sMonth * sMonth) / 2;

  const rng = mulberry32(0x9e3779b9);

  // valuesByMonth[m] = array of simulated values at end of month m (1-indexed).
  const valuesByMonth: number[][] = Array.from({ length: months }, () => new Array(simulations));

  for (let s = 0; s < simulations; s++) {
    let value = startingValue;
    for (let m = 0; m < months; m++) {
      const z = randn(rng);
      value = value * Math.exp(mMonth + sMonth * z);
      value += monthlyContribution; // contribute at month end
      valuesByMonth[m][s] = value;
    }
  }

  const monthsOut = valuesByMonth.map((col, m) => {
    const sorted = [...col].sort((a, b) => a - b);
    return {
      monthIndex: m + 1,
      p10: percentile(sorted, 10),
      p25: percentile(sorted, 25),
      p50: percentile(sorted, 50),
      p75: percentile(sorted, 75),
      p90: percentile(sorted, 90),
      invested: startingValue + monthlyContribution * (m + 1),
    };
  });

  const finals = valuesByMonth[months - 1] ?? [];
  const sortedFinals = [...finals].sort((a, b) => a - b);
  const invested = startingValue + monthlyContribution * months;
  const finalMean = finals.reduce((sum, v) => sum + v, 0) / (finals.length || 1);
  const probProfit = finals.filter((v) => v >= invested).length / (finals.length || 1);
  const probTarget =
    target != null ? finals.filter((v) => v >= target).length / (finals.length || 1) : null;

  const round = (n: number) => Math.round(n * 100) / 100;

  return {
    months: monthsOut.map((m) => ({
      monthIndex: m.monthIndex,
      p10: round(m.p10),
      p25: round(m.p25),
      p50: round(m.p50),
      p75: round(m.p75),
      p90: round(m.p90),
      invested: round(m.invested),
    })),
    summary: {
      finalP10: round(percentile(sortedFinals, 10)),
      finalP25: round(percentile(sortedFinals, 25)),
      finalP50: round(percentile(sortedFinals, 50)),
      finalP75: round(percentile(sortedFinals, 75)),
      finalP90: round(percentile(sortedFinals, 90)),
      finalMean: round(finalMean),
      totalContributed: round(monthlyContribution * months),
      invested: round(invested),
      medianProfit: round(percentile(sortedFinals, 50) - invested),
      probProfit: Math.round(probProfit * 1000) / 1000,
      probTarget: probTarget == null ? null : Math.round(probTarget * 1000) / 1000,
    },
  };
}
