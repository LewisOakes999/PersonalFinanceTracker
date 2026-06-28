import { describe, it, expect } from "vitest";
import { buildPeriod } from "../period";

const anchor = { year: 2026, month: 6, from: "2026-01-10", to: "2026-01-20" };

describe("buildPeriod", () => {
  it("month: inclusive start, exclusive end, long label", () => {
    const p = buildPeriod({ mode: "month", ...anchor });
    expect(p.start).toBe("2026-06-01");
    expect(p.end).toBe("2026-07-01");
    expect(p.label).toMatch(/June 2026/);
  });

  it("calendar year spans Jan–Jan", () => {
    const p = buildPeriod({ mode: "year", ...anchor });
    expect(p.start).toBe("2026-01-01");
    expect(p.end).toBe("2027-01-01");
    expect(p.label).toBe("2026");
  });

  it("UK tax year runs 6 Apr – 6 Apr", () => {
    const p = buildPeriod({ mode: "taxYear", ...anchor });
    expect(p.start).toBe("2026-04-06");
    expect(p.end).toBe("2027-04-06");
    expect(p.label).toBe("2026/27 tax year");
  });

  it("custom range makes the end exclusive (+1 day)", () => {
    const p = buildPeriod({ mode: "custom", ...anchor });
    expect(p.start).toBe("2026-01-10");
    expect(p.end).toBe("2026-01-21");
  });

  it("all-time has no bounds", () => {
    const p = buildPeriod({ mode: "all", ...anchor });
    expect(p.start).toBeUndefined();
    expect(p.end).toBeUndefined();
    expect(p.label).toBe("All time");
  });
});
