import { describe, it, expect } from "vitest";
import { realFactor } from "../inflation";

describe("realFactor", () => {
  it("is 1 at month 0", () => {
    expect(realFactor(3, 0)).toBe(1);
  });
  it("is 1 when inflation is zero", () => {
    expect(realFactor(0, 120)).toBe(1);
  });
  it("deflates by the annual rate over a year", () => {
    expect(realFactor(10, 12)).toBeCloseTo(1 / 1.1, 6);
  });
  it("compounds over multiple years", () => {
    expect(realFactor(5, 24)).toBeCloseTo(1 / Math.pow(1.05, 2), 6);
  });
});
