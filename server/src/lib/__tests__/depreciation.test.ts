import { describe, it, expect } from "vitest";
import { canDepreciate, depreciatedValue, depreciationRate } from "../depreciation.js";

const yearsAgo = (n: number) => new Date(Date.now() - n * 365.2425 * 24 * 60 * 60 * 1000);

describe("depreciation rates", () => {
  it("are fixed per asset type, not caller-supplied", () => {
    expect(depreciationRate("vehicle")).toBe(0.15);
    expect(depreciationRate("other")).toBe(0.1);
    expect(depreciationRate("valuables")).toBe(0.02);
  });

  it("treats property and cash as non-depreciating", () => {
    expect(depreciationRate("property")).toBe(0);
    expect(depreciationRate("cash")).toBe(0);
    expect(canDepreciate("property")).toBe(false);
    expect(canDepreciate("vehicle")).toBe(true);
  });

  it("falls back to zero for an unknown type", () => {
    expect(depreciationRate("spaceship")).toBe(0);
  });
});

describe("depreciatedValue", () => {
  it("reduces on a declining balance, not straight line", () => {
    // 20,000 at 15%/yr → 17,000 after one year, 14,450 after two.
    expect(depreciatedValue({ value: 20000, type: "vehicle", depreciates: true, from: yearsAgo(1) }))
      .toBeCloseTo(17000, 0);
    expect(depreciatedValue({ value: 20000, type: "vehicle", depreciates: true, from: yearsAgo(2) }))
      .toBeCloseTo(14450, 0);
  });

  it("is unchanged when the flag is off, even for a depreciating type", () => {
    expect(
      depreciatedValue({ value: 20000, type: "vehicle", depreciates: false, from: yearsAgo(3) })
    ).toBe(20000);
  });

  it("is unchanged for types that don't depreciate", () => {
    expect(
      depreciatedValue({ value: 315000, type: "property", depreciates: true, from: yearsAgo(5) })
    ).toBe(315000);
  });

  it("needs a start date to depreciate from", () => {
    expect(depreciatedValue({ value: 20000, type: "vehicle", depreciates: true, from: null })).toBe(
      20000
    );
  });

  it("does not depreciate for a future-dated value", () => {
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    expect(
      depreciatedValue({ value: 20000, type: "vehicle", depreciates: true, from: nextYear })
    ).toBe(20000);
  });

  it("handles part-years continuously rather than jumping on anniversaries", () => {
    const half = depreciatedValue({
      value: 20000,
      type: "vehicle",
      depreciates: true,
      from: yearsAgo(0.5),
    });
    expect(half).toBeLessThan(20000);
    expect(half).toBeGreaterThan(17000);
  });

  it("never goes below zero", () => {
    const v = depreciatedValue({
      value: 100,
      type: "vehicle",
      depreciates: true,
      from: yearsAgo(200),
    });
    expect(v).toBeGreaterThanOrEqual(0);
  });
});
