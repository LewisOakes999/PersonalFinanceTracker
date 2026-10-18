import { describe, it, expect } from "vitest";
import type { BodyWeight, Workout, WorkoutKind, WorkoutSet } from "../../types";
import {
  cardioBests,
  cardioSessions,
  durationInput,
  e1rm,
  exerciseProgress,
  formatClock,
  formatMinutes,
  movingAverage,
  paceLabel,
  parseDuration,
  streak,
  weekStart,
  weeklySummary,
  weightChange,
  workoutSummary,
} from "../fitness";

const iso = (d: string) => `${d}T00:00:00.000Z`;
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
  ...extra,
});
const sets = (exercise: string, ...pairs: [number, number][]): WorkoutSet[] =>
  pairs.map(([reps, weightKg]) => ({ exercise, reps, weightKg }));

describe("parseDuration", () => {
  it("reads plain numbers as minutes", () => {
    expect(parseDuration("45")).toBe(2700);
    expect(parseDuration("45.5")).toBe(2730);
  });
  it("reads m:ss and h:mm:ss", () => {
    expect(parseDuration("25:30")).toBe(1530);
    expect(parseDuration("1:05:30")).toBe(3930);
  });
  it("is null when blank and NaN when unreadable", () => {
    expect(parseDuration("  ")).toBeNull();
    expect(parseDuration("25:75")).toBeNaN();
    expect(parseDuration("abc")).toBeNaN();
    expect(parseDuration("0")).toBeNaN();
    expect(parseDuration("1:2:3:4")).toBeNaN();
  });
});

describe("duration display", () => {
  it("shows clock times with and without hours", () => {
    expect(formatClock(1530)).toBe("25:30");
    expect(formatClock(3930)).toBe("1:05:30");
  });
  it("shows friendly totals", () => {
    expect(formatMinutes(2700)).toBe("45 min");
    expect(formatMinutes(3900)).toBe("1 h 5 min");
    expect(formatMinutes(7200)).toBe("2 h");
  });
  it("round-trips through the form", () => {
    expect(durationInput(2700)).toBe("45");
    expect(durationInput(1530)).toBe("25:30");
    expect(parseDuration(durationInput(3930))).toBe(3930);
    expect(durationInput(null)).toBe("");
  });
});

describe("pace", () => {
  it("is per km for runs and walks", () => {
    expect(paceLabel("run", 5, 1530)).toBe("5:06 /km");
  });
  it("is per 100 m for swims", () => {
    expect(paceLabel("swim", 1.5, 1875)).toBe("2:05 /100m");
  });
  it("is a speed for rides", () => {
    expect(paceLabel("cycle", 20, 3000)).toBe("24.0 km/h");
  });
  it("needs both a distance and a time", () => {
    expect(paceLabel("run", 5, null)).toBeNull();
    expect(paceLabel("run", null, 1500)).toBeNull();
  });
});

describe("weekStart", () => {
  it("is the Monday of the week", () => {
    expect(weekStart(new Date(iso("2026-10-14"))).toISOString().slice(0, 10)).toBe("2026-10-12"); // Wed
    expect(weekStart(new Date(iso("2026-10-12"))).toISOString().slice(0, 10)).toBe("2026-10-12"); // Mon
  });
  it("puts Sunday at the end of its week, not the start of the next", () => {
    expect(weekStart(new Date(iso("2026-10-18"))).toISOString().slice(0, 10)).toBe("2026-10-12");
  });
});

describe("weeklySummary and streak", () => {
  const now = new Date(iso("2026-10-14")); // Wednesday
  const ws = [
    workout("2026-10-13", "run", { durationSec: 1800, distanceKm: 5 }),
    workout("2026-10-12", "strength", { durationSec: 3600 }),
    workout("2026-10-07", "class", { durationSec: 3600 }),
    workout("2026-10-06", "run", { distanceKm: 3 }),
    workout("2026-10-05", "swim"),
    workout("2026-09-30", "walk"),
    workout("2026-09-29", "walk"),
    workout("2026-09-28", "walk"),
    workout("2026-08-01", "run"), // outside the window
  ];
  const weeks = weeklySummary(ws, 4, now);

  it("buckets workouts into Monday-start weeks, oldest first", () => {
    expect(weeks.map((w) => w.start.toISOString().slice(0, 10))).toEqual([
      "2026-09-21",
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
    ]);
    expect(weeks.map((w) => w.workouts)).toEqual([0, 3, 3, 2]);
  });
  it("totals time and distance per kind", () => {
    expect(weeks[3].seconds).toBe(5400);
    expect(weeks[2].km).toEqual({ run: 3 });
  });
  it("doesn't let the unfinished current week break a streak", () => {
    expect(streak(weeks, 3)).toBe(2); // this week at 2/3 is still in progress
  });
  it("counts the current week once it's hit", () => {
    expect(streak(weeks, 2)).toBe(3);
  });
  it("stops at the first missed week", () => {
    expect(streak(weeks, 4)).toBe(0);
  });
});

describe("e1rm", () => {
  it("takes a single at face value", () => {
    expect(e1rm(100, 1)).toBe(100);
  });
  it("uses Epley for more reps", () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.67, 2);
  });
  it("is zero for bodyweight sets", () => {
    expect(e1rm(0, 12)).toBe(0);
  });
});

describe("exerciseProgress", () => {
  const ws = [
    workout("2026-09-01", "strength", { sets: sets("Bench Press", [8, 60], [8, 60]) }),
    workout("2026-09-08", "strength", { sets: sets("bench press", [8, 62.5], [6, 65]) }),
    workout("2026-09-15", "strength", { sets: sets("Bench press", [5, 60]) }), // an easy day
    workout("2026-09-22", "strength", { sets: [...sets("BENCH PRESS ", [5, 70]), ...sets("Pull-up", [8, 0])] }),
    workout("2026-09-29", "strength", { sets: sets("Pull-up", [10, 0], [9, 0]) }),
  ];
  const progress = exerciseProgress(ws);
  const bench = progress.find((p) => p.key === "bench press")!;
  const pullup = progress.find((p) => p.key === "pull-up")!;

  it("groups an exercise however it was capitalised", () => {
    expect(bench.sessions).toHaveLength(4);
    expect(bench.name).toBe("BENCH PRESS");
  });
  it("tracks the heaviest set and best estimated max", () => {
    expect(bench.heaviest).toEqual({ kg: 70, reps: 5, date: iso("2026-09-22") });
    expect(bench.bestE1rm!.kg).toBeCloseTo(e1rm(70, 5), 6);
  });
  it("flags sessions that beat every earlier one", () => {
    expect(bench.sessions.map((s) => s.pb)).toEqual([false, true, false, true]);
  });
  it("tracks bodyweight moves by reps", () => {
    expect(pullup.bodyweight).toBe(true);
    expect(pullup.heaviest).toBeNull();
    expect(pullup.mostReps).toEqual({ reps: 10, date: iso("2026-09-29") });
    expect(pullup.sessions.map((s) => s.pb)).toEqual([false, true]);
  });
  it("lists the most recently done exercise first", () => {
    expect(progress[0].key).toBe("pull-up");
  });
  it("adds up volume", () => {
    expect(bench.sessions[0].volume).toBe(960);
  });
});

describe("cardio", () => {
  const ws = [
    workout("2026-09-01", "run", { distanceKm: 5, durationSec: 1650 }),
    workout("2026-09-08", "run", { distanceKm: 10, durationSec: 3300 }),
    workout("2026-09-15", "run", { distanceKm: 5, durationSec: 1530 }),
    workout("2026-09-16", "cycle", { distanceKm: 30, durationSec: 3600 }),
  ];
  it("keeps one kind, oldest first, with pace", () => {
    const runs = cardioSessions(ws, "run");
    expect(runs.map((r) => r.km)).toEqual([5, 10, 5]);
    expect(runs[2].pace).toBe(306);
  });
  it("finds the longest and fastest — fastest meaning lowest pace for runs", () => {
    const b = cardioBests(cardioSessions(ws, "run"), "run");
    expect(b.longest).toMatchObject({ km: 10, date: iso("2026-09-08") });
    expect(b.fastest).toMatchObject({ pace: 306, date: iso("2026-09-15") });
    expect(b.fastest!.workoutId).toBe(cardioSessions(ws, "run")[2].workoutId);
  });
  it("treats fastest as highest speed for rides", () => {
    const b = cardioBests(cardioSessions(ws, "cycle"), "cycle");
    expect(b.fastest!.pace).toBe(30);
  });
});

describe("body weight", () => {
  const w = (date: string, weightKg: number): BodyWeight => ({ id: date, date: iso(date), weightKg });
  const points = [w("2026-08-01", 85), w("2026-09-01", 83.4), w("2026-09-20", 82.6), w("2026-10-01", 82.0)];

  it("compares with the last weigh-in at least that long ago", () => {
    expect(weightChange(points, 30)).toBe(-1.4); // vs 1 Sep
    expect(weightChange(points, 60)).toBe(-3); // vs 1 Aug
    expect(weightChange(points, 365)).toBeNull();
  });
  it("smooths with a trailing average", () => {
    expect(movingAverage(points, 2)).toEqual([85, 84.2, 83, 82.3]);
  });
});

describe("workoutSummary", () => {
  it("summarises each kind of workout", () => {
    expect(
      workoutSummary(workout("2026-10-01", "strength", { durationSec: 3000, sets: [...sets("Squat", [5, 100], [5, 100]), ...sets("squat", [5, 100]), ...sets("Row", [8, 50])] }))
    ).toBe("2 exercises · 4 sets · 50 min");
    expect(workoutSummary(workout("2026-10-01", "run", { distanceKm: 5, durationSec: 1530 }))).toBe(
      "5.00 km · 25:30 · 5:06 /km"
    );
    expect(workoutSummary(workout("2026-10-01", "class", { durationSec: 3600 }))).toBe("1 h");
  });
});
