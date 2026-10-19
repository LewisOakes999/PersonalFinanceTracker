import { describe, it, expect } from "vitest";
import type { BodyWeight, FitnessGoal, Workout, WorkoutKind, WorkoutSet } from "../../types";
import { formatGoalRate, formatGoalValue, goalStatus, goalTitle, linearFit, newlyReached } from "../goals";

const iso = (d: string) => `${d}T00:00:00.000Z`;
const NOW = new Date(iso("2026-10-19")); // a Monday
const DAY_MS = 24 * 60 * 60 * 1000;
/** The date `n` days after `d`, as YYYY-MM-DD. */
const plus = (d: string, n: number) => new Date(new Date(iso(d)).getTime() + n * DAY_MS).toISOString().slice(0, 10);

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
  ...extra,
});
const lift = (date: string, exercise: string, ...pairs: [number, number][]) =>
  workout(date, "strength", {
    sets: pairs.map(([reps, weightKg]): WorkoutSet => ({ exercise, reps, weightKg })),
  });
const run = (date: string, km: number, sec: number, extra: Partial<Workout> = {}) =>
  workout(date, "run", { distanceKm: km, durationSec: sec, ...extra });
const weigh = (date: string, weightKg: number, bodyFatPct: number | null = null): BodyWeight => ({
  id: date,
  date: iso(date),
  weightKg,
  bodyFatPct,
});

const goal = (extra: Partial<FitnessGoal>): FitnessGoal => ({
  id: `g${++n}`,
  type: "strength",
  exercise: null,
  weightKg: null,
  reps: null,
  kind: null,
  distanceKm: null,
  timeSec: null,
  measure: null,
  target: null,
  deadline: null,
  startDate: iso("2026-10-01"),
  createdAt: iso("2026-10-01"),
  ...extra,
});

describe("linearFit", () => {
  it("fits a straight line", () => {
    const f = linearFit([
      { day: 0, value: 1 },
      { day: 10, value: 2 },
      { day: 20, value: 3 },
    ])!;
    expect(f.slope).toBeCloseTo(0.1, 10);
    expect(f.at(30)).toBeCloseTo(4, 10);
  });
  it("has no line through points on one day", () => {
    expect(linearFit([{ day: 5, value: 1 }, { day: 5, value: 2 }])).toBeNull();
  });
});

describe("strength goals", () => {
  // Twelve Mondays, the single going up 0.5 kg a week: 85 → 90.5 kg on 19 Oct.
  const bench = Array.from({ length: 12 }, (_, i) => lift(plus("2026-08-03", i * 7), "Bench press", [1, 85 + 0.5 * i]));
  const benchGoal = goal({ exercise: "bench press", weightKg: 100, reps: 1 });

  it("projects when the trend reaches the target", () => {
    const s = goalStatus(benchGoal, bench, [], NOW);
    expect(s.better).toBe("up");
    expect(s.target).toBe(100);
    expect(s.start).toBe(89); // best in the 12 weeks before 1 Oct
    expect(s.current).toBe(90.5);
    expect(s.progress).toBeCloseTo(1.5 / 11, 6);
    expect(s.ratePerDay).toBeCloseTo(0.5 / 7, 6);
    expect(s.outlook).toEqual({ state: "projected", date: plus("2026-10-19", 133), days: 133 }); // 9.5 kg at 0.5 kg a week
  });

  it("counts a lift at the target from the day the goal was set, and not before", () => {
    const old = lift("2025-03-01", "Bench press", [1, 100]);
    expect(goalStatus(benchGoal, [old, ...bench], [], NOW).outlook.state).not.toBe("reached");
    const done = lift("2026-10-15", "Bench Press", [1, 100]);
    const s = goalStatus(benchGoal, [...bench, done], [], NOW);
    expect(s.outlook).toEqual({ state: "reached", date: iso("2026-10-15"), workoutId: done.id });
    expect(s.progress).toBe(1);
  });

  it("needs the reps as well as the weight", () => {
    const g = goal({ exercise: "Squat", weightKg: 100, reps: 3 });
    const heavySingle = lift("2026-10-10", "Squat", [1, 105], [2, 100]);
    expect(goalStatus(g, [heavySingle], [], NOW).outlook.state).not.toBe("reached");
    expect(goalStatus(g, [lift("2026-10-12", "Squat", [3, 100])], [], NOW).outlook.state).toBe("reached");
  });

  it("is due when your estimated max is already past the target", () => {
    const g = goal({ exercise: "Deadlift", weightKg: 140, reps: 1 });
    const ws = [0, 7, 14].map((d) => lift(plus("2026-09-28", d), "Deadlift", [5, 130 + d / 7])); // e1RM ≈ 152+
    expect(goalStatus(g, ws, [], NOW).outlook.state).toBe("due");
  });

  it("tracks reps for a bodyweight move", () => {
    const g = goal({ exercise: "Pull-ups", weightKg: null, reps: 15 });
    const ws = [10, 11, 12, 13].map((r, i) => lift(plus("2026-09-28", i * 7), "Pull-ups", [r, 0], [r - 2, 0]));
    const s = goalStatus(g, ws, [], NOW);
    expect(s.target).toBe(15);
    expect(s.current).toBe(13);
    expect(s.outlook).toEqual({ state: "projected", date: plus("2026-10-19", 14), days: 14 });
    expect(goalTitle(g)).toBe("Pull-ups × 15");
    expect(formatGoalValue(g, 13)).toBe("13 reps");
  });

  it("says so when you're not improving, or it's years away", () => {
    const down = [0, 7, 14, 21].map((d) => lift(plus("2026-09-28", d - 7), "Bench press", [1, 95 - d / 7]));
    expect(goalStatus(benchGoal, down, [], NOW).outlook.state).toBe("stalled");
    const slow = [0, 7, 14, 21].map((d) => lift(plus("2026-09-28", d - 7), "Bench press", [1, 80 + d / 700]));
    expect(goalStatus(benchGoal, slow, [], NOW).outlook.state).toBe("far");
  });

  it("needs a few weeks of data before guessing", () => {
    const two = [lift("2026-10-12", "Bench press", [1, 90]), lift("2026-10-19", "Bench press", [1, 91])];
    expect(goalStatus(benchGoal, two, [], NOW).outlook).toEqual({ state: "needData", points: 2 });
    // Three sessions in one week are one weekly best.
    const oneWeek = ["2026-10-13", "2026-10-15", "2026-10-17"].map((d, i) => lift(d, "Bench press", [1, 90 + i]));
    expect(goalStatus(benchGoal, oneWeek, [], NOW).outlook).toEqual({ state: "needData", points: 1 });
  });
});

describe("cardio goals", () => {
  const g = goal({ type: "cardio", kind: "run", distanceKm: 5, timeSec: 1200 });
  // 5 km every Monday, 15 s quicker each week: 21:30 → 20:45.
  const parkruns = [1290, 1275, 1260, 1245].map((t, i) => run(plus("2026-09-28", i * 7), 5, t));

  it("uses each week's best run of at least the distance", () => {
    const noise = [
      run("2026-10-14", 8, 8 * 360), // an easy long run: slower, so not that week's best
      run("2026-10-16", 3, 3 * 200), // fast, but too short to count
      workout("2026-10-17", "run", { intervals: [{ distanceM: 800, durationSec: 150 }], distanceKm: 6, durationSec: 1200 }),
    ];
    const s = goalStatus(g, [...parkruns, ...noise], [], NOW);
    expect(s.better).toBe("down");
    expect(s.points.map((p) => p.value)).toEqual([1290, 1275, 1260, 1245]);
    expect(s.start).toBe(1290);
    expect(s.current).toBe(1245);
    expect(s.progress).toBeCloseTo(0.5, 6);
    expect(s.outlook).toEqual({ state: "projected", date: plus("2026-10-19", 21), days: 21 });
    expect(formatGoalRate(g, s.ratePerDay!, s.better)).toBe("64 s quicker a month");
  });

  it("scales a slightly short GPS reading to the full distance", () => {
    const s = goalStatus(g, [run("2026-10-18", 4.98, 1195)], [], NOW); // 19:55 for 4.98 km ≈ 20:00 for 5
    expect(s.current).toBeCloseTo((1195 / 4.98) * 5, 6);
    expect(s.outlook.state).toBe("reached");
  });

  it("compares the projection with a deadline", () => {
    const onTime = goalStatus({ ...g, deadline: iso("2026-12-01") }, parkruns, [], NOW);
    expect(onTime.deadline).toMatchObject({ onTrack: true, daysLeft: 43 });
    const late = goalStatus({ ...g, deadline: iso("2026-11-01") }, parkruns, [], NOW);
    expect(late.deadline!.onTrack).toBe(false);
    expect(late.deadline!.neededPerDay).toBeCloseTo(45 / 13, 6); // 45 s to find in 13 days
    expect(goalTitle(g)).toBe("5 km run in 20:00");
  });
});

describe("body goals", () => {
  // Every third day from 10 Sep, 0.2 kg lighter each time: 84 → 81.4 kg on 19 Oct.
  const weights = Array.from({ length: 14 }, (_, i) => weigh(plus("2026-09-10", i * 3), 84 - 0.2 * i));
  const lose = goal({ type: "body", measure: "weight", target: 80, startDate: iso("2026-09-10") });

  it("reads losing from where you started, and projects from your weigh-ins", () => {
    const s = goalStatus(lose, [], weights, NOW);
    expect(s.better).toBe("down");
    expect(s.start).toBe(84);
    expect(s.current).toBeCloseTo(82, 6); // the 7-reading trend
    expect(s.progress).toBeCloseTo(0.5, 6);
    expect(s.outlook).toEqual({ state: "projected", date: plus("2026-10-19", 21), days: 21 });
    expect(formatGoalRate(lose, s.ratePerDay!, s.better)).toBe("−0.5 kg a week");
    expect(goalTitle(lose)).toBe("Body weight 80 kg");
  });

  it("reads gaining when the target is above where you started", () => {
    const gain = goal({ type: "body", measure: "weight", target: 75 });
    const s = goalStatus(gain, [], [weigh("2026-09-20", 70), weigh("2026-10-05", 71), weigh("2026-10-18", 72)], NOW);
    expect(s.better).toBe("up");
    expect(formatGoalRate(gain, s.ratePerDay!, s.better)).toMatch(/^\+0\.\d kg a week$/);
  });

  it("is reached when the trend gets there, not on one light day", () => {
    const g = goal({ type: "body", measure: "weight", target: 80 });
    const blip = [weigh("2026-10-02", 81), weigh("2026-10-03", 79.5), weigh("2026-10-04", 81)];
    expect(goalStatus(g, [], blip, NOW).outlook.state).not.toBe("reached");
    const settled = [...blip, weigh("2026-10-05", 79), weigh("2026-10-06", 79), weigh("2026-10-07", 79)];
    // By 6 Oct the readings average 79.9 kg.
    expect(goalStatus(g, [], settled, NOW).outlook).toEqual({ state: "reached", date: iso("2026-10-06"), workoutId: null });
  });

  it("keeps its starting line when you weigh in on the day you set it", () => {
    // Set at 20.5% from a trend of about 20.6%: a goal to lose. A low reading
    // that same day pulls the trend under, which reaches it rather than turning
    // it into a goal to gain.
    const g = goal({ type: "body", measure: "bodyFat", target: 20.5, startDate: iso("2026-10-19") });
    const before = [21, 20.8, 20.7, 20.6, 20.4, 20.3, 20.1].map((f, i) => weigh(plus("2026-09-01", i * 6), 84, f));
    expect(goalStatus(g, [], before, NOW).better).toBe("down");
    const after = goalStatus(g, [], [...before, weigh("2026-10-19", 84, 19)], NOW);
    expect(after.better).toBe("down");
    expect(after.outlook).toEqual({ state: "reached", date: iso("2026-10-19"), workoutId: null });
  });

  it("follows body fat when that's the measure", () => {
    const g = goal({ type: "body", measure: "bodyFat", target: 15 });
    const s = goalStatus(g, [], [weigh("2026-10-01", 80, 18), weigh("2026-10-08", 80), weigh("2026-10-15", 80, 17)], NOW);
    expect(s.start).toBe(18);
    expect(s.points.map((p) => p.value)).toEqual([18, 17]); // the weigh-in without body fat is skipped
    expect(goalTitle(g)).toBe("Body fat 15%");
  });
});

it("spots goals that have just been reached", () => {
  const g = goal({ exercise: "Squat", weightKg: 100, reps: 1 });
  const before = [goalStatus(g, [], [], NOW)];
  const after = [goalStatus(g, [lift("2026-10-19", "Squat", [1, 100])], [], NOW)];
  expect(newlyReached(before, after).map((s) => s.goal.id)).toEqual([g.id]);
  expect(newlyReached(after, after)).toEqual([]);
});
