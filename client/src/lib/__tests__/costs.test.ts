import { describe, it, expect } from "vitest";
import type { FitnessSpending, Gear, Workout, WorkoutKind } from "../../types";
import { trainingCosts } from "../costs";

const iso = (d: string) => `${d}T00:00:00.000Z`;
let n = 0;
const workout = (date: string, kind: WorkoutKind): Workout => ({
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
});
const gear = (price: number | null, boughtOn: string | null): Gear => ({
  id: `g${++n}`,
  name: "Shoes",
  kinds: ["run"],
  transactionId: null,
  transaction: null,
  price,
  boughtOn: boughtOn && iso(boughtOn),
  startKm: 0,
  lifespanKm: null,
  retiredAt: null,
  createdAt: iso("2026-01-01"),
});

const data: FitnessSpending = {
  baseCurrency: "GBP",
  months: ["2026-08", "2026-09", "2026-10"],
  categories: [
    { id: "gym", name: "Gym", color: "#0f0", kinds: ["strength", "class"], totals: [0, 35, 35] },
    { id: "races", name: "Races", color: "#00f", kinds: [], totals: [25, 0, 0] },
  ],
};
const workouts = [
  workout("2026-08-05", "strength"), // before the gym membership started
  workout("2026-08-20", "run"),
  ...["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"].map((d) => workout(d, "strength")),
  workout("2026-09-12", "run"),
  workout("2026-10-03", "class"),
  workout("2026-10-07", "strength"),
  workout("2026-10-10", "run"),
  workout("2025-12-01", "run"), // outside the months
];

describe("trainingCosts", () => {
  const c = trainingCosts(data, workouts, [gear(120, "2026-10-01"), gear(null, "2026-10-02"), gear(80, "2025-01-01")]);

  it("adds up each month, with kit in the month it was bought", () => {
    expect(c.months.map((m) => [m.total, m.kit, m.workouts])).toEqual([
      [25, 0, 2],
      [35, 0, 6],
      [155, 120, 3],
    ]);
    expect(c.months[1].perWorkout).toBeCloseTo(35 / 6, 10);
    expect(c.months[2].byCategory).toEqual([35, 0]);
  });

  it("divides a category's fee by the workouts it paid for", () => {
    const gym = c.categories[0];
    expect(gym.thisMonth).toEqual({ spend: 35, visits: 2, perVisit: 17.5 });
    // August had no fee, so its gym session isn't one the membership covered.
    expect(gym.overall).toEqual({ spend: 70, visits: 7, perVisit: 10, months: 2 });
  });

  it("counts every workout for a category with no kinds chosen", () => {
    const races = c.categories[1];
    expect(races.overall).toEqual({ spend: 25, visits: 2, perVisit: 12.5, months: 1 });
    expect(races.thisMonth).toEqual({ spend: 0, visits: 3, perVisit: null }); // no fee this month
  });

  it("gives an overall cost per workout", () => {
    expect(c.total).toEqual({ spend: 215, kit: 120, workouts: 11, perWorkout: 215 / 11 });
  });

  it("starts from the month you began logging workouts", () => {
    // Logging began in September, so August's race entry is before the app knew.
    const c = trainingCosts(data, workouts.filter((w) => w.date >= iso("2026-09-01")), []);
    expect(c.months.map((m) => m.month)).toEqual(["2026-09", "2026-10"]);
    expect(c.categories[1].overall).toEqual({ spend: 0, visits: 0, perVisit: null, months: 0 });
    expect(c.total.spend).toBe(70);
  });

  it("has no cost per workout in a month without workouts", () => {
    const empty = trainingCosts(data, [], []);
    expect(empty.months.every((m) => m.perWorkout === null)).toBe(true);
    expect(empty.categories[0].overall.perVisit).toBeNull();
  });
});
