import { describe, it, expect } from "vitest";
import { advance } from "../recurfreq";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("advance", () => {
  it("weekly adds 7 days", () => {
    expect(iso(advance(d("2026-01-01"), "weekly"))).toBe("2026-01-08");
  });
  it("fortnightly adds 14 days", () => {
    expect(iso(advance(d("2026-01-01"), "fortnightly"))).toBe("2026-01-15");
  });
  it("monthly adds 1 month", () => {
    expect(iso(advance(d("2026-01-15"), "monthly"))).toBe("2026-02-15");
  });
  it("quarterly adds 3 months", () => {
    expect(iso(advance(d("2026-01-15"), "quarterly"))).toBe("2026-04-15");
  });
  it("yearly adds 1 year", () => {
    expect(iso(advance(d("2026-01-15"), "yearly"))).toBe("2027-01-15");
  });
  it("does not mutate the input date", () => {
    const original = d("2026-01-15");
    advance(original, "monthly");
    expect(iso(original)).toBe("2026-01-15");
  });
});
