import { describe, it, expect } from "vitest";
import { afterCloseBound, assertOpenOn, isAfterClose } from "../accountClose";

const d = (s: string) => new Date(s.includes("T") ? s : `${s}T00:00:00.000Z`);

describe("isAfterClose", () => {
  const closedAt = d("2026-09-15");

  it("never blocks an account that isn't closed", () => {
    expect(isAfterClose(d("2030-01-01"), null)).toBe(false);
    expect(isAfterClose(d("2030-01-01"), undefined)).toBe(false);
  });
  it("allows dates before the close day", () => {
    expect(isAfterClose(d("2026-09-14"), closedAt)).toBe(false);
  });
  it("allows the close day itself, whatever the time", () => {
    expect(isAfterClose(d("2026-09-15"), closedAt)).toBe(false);
    expect(isAfterClose(d("2026-09-15T23:59:59.999Z"), closedAt)).toBe(false);
  });
  it("blocks from the start of the next day", () => {
    expect(isAfterClose(d("2026-09-16"), closedAt)).toBe(true);
    expect(isAfterClose(d("2026-10-01"), closedAt)).toBe(true);
  });
  it("uses the close day even if closedAt carries a time", () => {
    const late = d("2026-09-15T18:30:00.000Z");
    expect(isAfterClose(d("2026-09-15T23:00:00.000Z"), late)).toBe(false);
    expect(isAfterClose(d("2026-09-16"), late)).toBe(true);
  });
});

describe("afterCloseBound", () => {
  it("is midnight UTC the day after closing", () => {
    expect(afterCloseBound(d("2026-09-15T18:30:00.000Z")).toISOString()).toBe(
      "2026-09-16T00:00:00.000Z"
    );
  });
});

describe("assertOpenOn", () => {
  const account = { name: "Old ISA", closedAt: d("2026-09-15") };

  it("passes for dates up to and including the close day", () => {
    expect(() => assertOpenOn(account, d("2026-09-15"))).not.toThrow();
  });
  it("names the account and date when rejecting", () => {
    expect(() => assertOpenOn(account, d("2026-09-16"))).toThrow(
      "“Old ISA” went inactive on 15 Sept 2026, so nothing can be dated after that."
    );
  });
});
