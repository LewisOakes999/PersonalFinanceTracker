import { describe, it, expect } from "vitest";
import { matchProfile, profileLabel, riskHint } from "../riskProfiles";

describe("riskProfiles", () => {
  it("matches an exact preset", () => {
    expect(matchProfile(7.5, 16)).toBe("global");
    expect(matchProfile(6, 10)).toBe("balanced");
  });
  it("falls back to custom when nothing matches", () => {
    expect(matchProfile(7.3, 15)).toBe("custom");
  });
  it("labels a matched preset", () => {
    expect(profileLabel(7.5, 16)).toMatch(/Global shares/);
  });
  it("hint reports the one-sigma range", () => {
    expect(riskHint(7, 15)).toContain("-8% and 22%");
  });
  it("hint handles zero volatility", () => {
    expect(riskHint(4, 0)).toMatch(/steady/i);
  });
});
