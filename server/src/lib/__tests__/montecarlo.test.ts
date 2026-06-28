import { describe, it, expect } from "vitest";
import { monteCarlo } from "../montecarlo";

const base = {
  startingValue: 10000,
  monthlyContribution: 100,
  expectedReturnPct: 7,
  volatilityPct: 15,
  months: 120,
};

describe("monteCarlo", () => {
  it("returns one row per month with ordered percentile bands", () => {
    const r = monteCarlo(base);
    expect(r.months).toHaveLength(120);
    for (const m of r.months) {
      expect(m.p10).toBeLessThanOrEqual(m.p50);
      expect(m.p50).toBeLessThanOrEqual(m.p90);
    }
  });

  it("is deterministic for identical inputs", () => {
    const a = monteCarlo(base);
    const b = monteCarlo(base);
    expect(a.summary.finalP50).toBe(b.summary.finalP50);
    expect(a.summary.finalP90).toBe(b.summary.finalP90);
  });

  it("median sits below the mean (lognormal right-skew)", () => {
    const r = monteCarlo({ ...base, monthlyContribution: 0, volatilityPct: 20, months: 240 });
    expect(r.summary.finalP50).toBeLessThan(r.summary.finalMean);
  });

  it("zero volatility collapses to deterministic growth", () => {
    const r = monteCarlo({
      startingValue: 1000,
      monthlyContribution: 0,
      expectedReturnPct: 10,
      volatilityPct: 0,
      months: 12,
    });
    expect(r.summary.finalP50).toBeGreaterThan(1095);
    expect(r.summary.finalP50).toBeLessThan(1105);
    expect(r.summary.finalP10).toBeCloseTo(r.summary.finalP90, 0);
  });

  it("invested equals starting value plus contributions", () => {
    const r = monteCarlo({ ...base, months: 12 });
    expect(r.summary.invested).toBe(10000 + 100 * 12);
  });

  it("probabilities are within [0,1]", () => {
    const r = monteCarlo({ ...base, target: 30000 });
    expect(r.summary.probProfit).toBeGreaterThanOrEqual(0);
    expect(r.summary.probProfit).toBeLessThanOrEqual(1);
    expect(r.summary.probTarget).not.toBeNull();
  });
});
