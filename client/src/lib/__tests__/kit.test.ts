import { describe, it, expect } from "vitest";
import type { Gear, Workout, WorkoutKind } from "../../types";
import { defaultKit, kitFor, kitStats, sessionWord } from "../kit";

const iso = (d: string) => `${d}T00:00:00.000Z`;
const NOW = new Date(iso("2026-10-19"));
let n = 0;
const workout = (date: string, kind: WorkoutKind, extra: Partial<Workout> = {}): Workout => ({
  id: `w${++n}`,
  date: iso(date),
  kind,
  title: "",
  durationSec: null,
  distanceKm: null,
  notes: null,
  sets: [],
  intervals: [],
  recoverySec: null,
  gearId: null,
  ...extra,
});
const gear = (extra: Partial<Gear> = {}): Gear => ({
  id: `g${++n}`,
  name: "Pegasus",
  kinds: ["run"],
  transactionId: null,
  transaction: null,
  price: 120,
  boughtOn: iso("2026-08-01"),
  startKm: 0,
  lifespanKm: 600,
  retiredAt: null,
  createdAt: iso("2026-08-01"),
  ...extra,
});

describe("kitStats", () => {
  const shoes = gear({ startKm: 20 });
  // 10 km a week on Mondays for the last 8 weeks (24 Aug – 19 Oct), plus an older run.
  const runs = [
    workout("2026-08-10", "run", { gearId: shoes.id, distanceKm: 10, durationSec: 3000 }),
    ...Array.from({ length: 9 }, (_, i) =>
      workout(new Date(Date.UTC(2026, 7, 24 + i * 7)).toISOString().slice(0, 10), "run", {
        gearId: shoes.id,
        distanceKm: 10,
        durationSec: 3000,
      })
    ),
    workout("2026-10-18", "run", { distanceKm: 5 }), // in other shoes
  ];

  it("adds up distance, including what was on it already, and spreads the price", () => {
    const s = kitStats(shoes, runs, NOW);
    expect(s.sessions).toBe(10);
    expect(s.km).toBe(120); // 20 + 10 × 10
    expect(s.costPerKm).toBe(1);
    expect(s.costPerSession).toBe(12);
    expect(s.seconds).toBe(30000);
    expect(s.wear).toBeCloseTo(0.2, 10);
    expect(s.firstUsed).toBe(iso("2026-08-10"));
    expect(s.lastUsed).toBe(iso("2026-10-19"));
  });

  it("projects when it'll reach its lifespan at the recent rate", () => {
    const s = kitStats(shoes, runs, NOW);
    // 80 km in the last 56 days (24 Aug's run falls just outside): 10 km a week.
    expect(s.kmPerWeek).toBeCloseTo(10, 10);
    expect(s.kmLeft).toBe(480);
    expect(s.replaceOn).toBe("2027-09-20"); // 48 weeks on
  });

  it("uses the time since its first outing when that's shorter than 8 weeks", () => {
    const fresh = gear();
    const two = [
      workout("2026-10-06", "run", { gearId: fresh.id, distanceKm: 7 }),
      workout("2026-10-13", "run", { gearId: fresh.id, distanceKm: 7 }),
    ];
    expect(kitStats(fresh, two, NOW).kmPerWeek).toBeCloseTo((14 / 14) * 7, 10); // 14 km over 14 days
  });

  it("counts the reps of an interval run, and leaves out what it can't price", () => {
    const g = gear({ price: null, lifespanKm: null });
    const s = kitStats(g, [workout("2026-10-10", "run", { gearId: g.id, intervals: [{ distanceM: 800, durationSec: 170 }] })], NOW);
    expect(s.km).toBeCloseTo(0.8, 10);
    expect([s.costPerKm, s.costPerSession, s.wear, s.replaceOn]).toEqual([null, null, null, null]);
  });

  it("prices sessions without distance, like gym shoes", () => {
    const g = gear({ kinds: ["strength"], price: 60, lifespanKm: null });
    const s = kitStats(g, [workout("2026-10-01", "strength", { gearId: g.id }), workout("2026-10-08", "strength", { gearId: g.id })], NOW);
    expect(s.costPerKm).toBeNull();
    expect(s.costPerSession).toBe(30);
  });

  it("stops projecting once it's retired or worn out", () => {
    expect(kitStats({ ...shoes, retiredAt: iso("2026-10-19") }, runs, NOW).replaceOn).toBeNull();
    const worn = kitStats({ ...shoes, lifespanKm: 100 }, runs, NOW);
    expect(worn.wear).toBeCloseTo(1.2, 10);
    expect(worn.kmLeft).toBe(-20);
    expect(worn.replaceOn).toBeNull();
  });
});

describe("choosing kit for a workout", () => {
  const road = gear({ name: "Road" });
  const trail = gear({ name: "Trail", kinds: ["run", "walk"] });
  const old = gear({ name: "Old", retiredAt: iso("2026-09-01") });
  const all = [road, trail, old];

  it("offers what's in use and meant for the kind", () => {
    expect(kitFor("run", all).map((g) => g.name)).toEqual(["Road", "Trail"]);
    expect(kitFor("walk", all).map((g) => g.name)).toEqual(["Trail"]);
  });

  it("picks what you used last time, or the only option", () => {
    const ws = [
      workout("2026-10-01", "run", { gearId: road.id }),
      workout("2026-10-05", "run", { gearId: trail.id }),
      workout("2026-10-07", "run", { gearId: old.id }), // retired since, so not offered
    ];
    expect(defaultKit("run", all, ws)).toBe(trail.id);
    expect(defaultKit("run", all, [])).toBeNull(); // two to choose from, no history
    expect(defaultKit("walk", all, [])).toBe(trail.id);
    expect(defaultKit("swim", all, ws)).toBeNull();
  });

  it("names one use of the kit", () => {
    expect(sessionWord(["run"])).toBe("run");
    expect(sessionWord(["cycle"])).toBe("ride");
    expect(sessionWord(["run", "walk"])).toBe("session");
  });
});
