import { describe, it, expect } from "vitest";
import { contributedBy, forecastAt, growthFactor } from "../investmentPerformance";
import { monteCarlo } from "../montecarlo";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const yearsLater = (from: Date, years: number) => new Date(from.getTime() + years * YEAR_MS);

describe("growthFactor", () => {
  it("is 1 for money that hasn't been invested yet", () => {
    expect(growthFactor(0, 6, 15, 0)).toBe(1);
    expect(growthFactor(-1, 6, 15, 1.28)).toBe(1);
  });
  it("compounds at the expected return when there's no volatility", () => {
    expect(growthFactor(1, 6, 0, 0)).toBeCloseTo(1.06, 10);
    expect(growthFactor(2, 6, 0, 0)).toBeCloseTo(1.1236, 10);
  });
  it("puts the median below the mean once there's volatility", () => {
    expect(growthFactor(1, 6, 15, 0)).toBeLessThan(1.06);
  });
});

describe("forecastAt", () => {
  const start = d("2025-01-01");

  it("grows a lump sum and brackets the median with p10–p90", () => {
    const f = forecastAt([{ date: start, amount: 1000 }], yearsLater(start, 1), 6, 15);
    expect(f.p10).toBeLessThan(f.p50);
    expect(f.p50).toBeLessThan(f.p90);
    expect(f.p50).toBeCloseTo(1000 * growthFactor(1, 6, 15, 0), 6);
  });
  it("collapses to a single line with no volatility", () => {
    const f = forecastAt([{ date: start, amount: 1000 }], yearsLater(start, 1), 6, 0);
    expect(f.p10).toBeCloseTo(1060, 6);
    expect(f.p50).toBeCloseTo(1060, 6);
    expect(f.p90).toBeCloseTo(1060, 6);
  });
  it("ignores money put in after the date asked about", () => {
    const flows = [
      { date: start, amount: 1000 },
      { date: d("2026-06-01"), amount: 5000 },
    ];
    expect(forecastAt(flows, d("2026-01-01"), 6, 0).p50).toBeCloseTo(
      forecastAt([flows[0]], d("2026-01-01"), 6, 0).p50,
      6
    );
  });
  it("counts withdrawals against the expected value", () => {
    const at = yearsLater(start, 2);
    const withOut = forecastAt(
      [
        { date: start, amount: 1000 },
        { date: yearsLater(start, 1), amount: -500 },
      ],
      at,
      6,
      0
    );
    expect(withOut.p50).toBeCloseTo(1000 * 1.06 ** 2 - 500 * 1.06, 6);
  });
  it("matches the Monte Carlo forecast engine for a lump sum", () => {
    // Same inputs through both: the forecast page's simulation and this closed form.
    const sim = monteCarlo({
      startingValue: 10000,
      monthlyContribution: 0,
      expectedReturnPct: 6,
      volatilityPct: 15,
      months: 24,
      simulations: 20000,
    });
    const end = sim.months.at(-1)!;
    const f = forecastAt([{ date: start, amount: 10000 }], yearsLater(start, 2), 6, 15);
    expect(Math.abs(f.p50 / end.p50 - 1)).toBeLessThan(0.02);
    expect(Math.abs(f.p10 / end.p10 - 1)).toBeLessThan(0.03);
    expect(Math.abs(f.p90 / end.p90 - 1)).toBeLessThan(0.03);
  });
});

describe("contributedBy", () => {
  const flows = [
    { date: d("2026-01-01"), amount: 1000 },
    { date: d("2026-02-01"), amount: 200 },
    { date: d("2026-03-01"), amount: -150 },
  ];
  it("sums money in and out up to and including the date", () => {
    expect(contributedBy(flows, d("2026-02-01"))).toBe(1200);
    expect(contributedBy(flows, d("2026-12-31"))).toBe(1050);
  });
  it("is zero before anything went in", () => {
    expect(contributedBy(flows, d("2025-12-31"))).toBe(0);
  });
});
