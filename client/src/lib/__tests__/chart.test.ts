import { describe, it, expect } from "vitest";
import { fittedAxis, fittedDomain } from "../chart";

describe("fittedDomain", () => {
  it("brackets the data instead of anchoring at zero", () => {
    // The reported case: a year of net worth moving 171,328 → 177,050.
    const d = fittedDomain([171328, 173000, 175000, 177050])!;
    expect(d[0]).toBeGreaterThan(100000); // nowhere near zero
    expect(d[0]).toBeLessThanOrEqual(171328);
    expect(d[1]).toBeGreaterThanOrEqual(177050);
  });

  it("gives the movement most of the chart height", () => {
    const values = [171328, 177050];
    const [min, max] = fittedDomain(values)!;
    const usedFraction = (177050 - 171328) / (max - min);
    // Zero-anchored this was 3%; fitted it should dominate the plot.
    expect(usedFraction).toBeGreaterThan(0.5);
  });

  it("does not invent a negative axis for all-positive data", () => {
    expect(fittedDomain([10, 20, 30])![0]).toBeGreaterThanOrEqual(0);
  });

  it("does not invent a positive axis for all-negative data", () => {
    expect(fittedDomain([-30, -20, -10])![1]).toBeLessThanOrEqual(0);
  });

  it("still produces a band for a completely flat series", () => {
    const [min, max] = fittedDomain([5000, 5000, 5000])!;
    expect(max).toBeGreaterThan(min);
    expect(min).toBeLessThanOrEqual(5000);
    expect(max).toBeGreaterThanOrEqual(5000);
  });

  it("spans zero when the data does", () => {
    const [min, max] = fittedDomain([-500, 1500])!;
    expect(min).toBeLessThan(0);
    expect(max).toBeGreaterThan(1500 - 1);
  });

  it("returns undefined with no usable data so the chart keeps its default", () => {
    expect(fittedDomain([])).toBeUndefined();
    expect(fittedDomain([NaN, Infinity])).toBeUndefined();
  });

  it("rounds bounds to readable steps", () => {
    const [min, max] = fittedDomain([1013, 1987])!;
    expect(Number.isInteger(min)).toBe(true);
    expect(Number.isInteger(max)).toBe(true);
  });
});

describe("fittedAxis", () => {
  it("returns evenly spaced round ticks that span the domain exactly", () => {
    const axis = fittedAxis([11500, 12500, 13900])!;
    const gaps = axis.ticks.slice(1).map((t, i) => t - axis.ticks[i]);
    expect(new Set(gaps).size).toBe(1);
    expect(axis.ticks[0]).toBe(axis.domain[0]);
    expect(axis.ticks[axis.ticks.length - 1]).toBe(axis.domain[1]);
    expect(axis.ticks.length).toBeGreaterThanOrEqual(3);
    expect(axis.ticks.length).toBeLessThanOrEqual(6);
  });
  it("covers every value it was given", () => {
    const values = [300, 1850, 3900, 5700, 7644];
    const { domain } = fittedAxis(values)!;
    expect(domain[0]).toBeLessThanOrEqual(Math.min(...values));
    expect(domain[1]).toBeGreaterThanOrEqual(Math.max(...values));
  });
  it("has nothing to fit with no data", () => {
    expect(fittedAxis([])).toBeUndefined();
  });
});
