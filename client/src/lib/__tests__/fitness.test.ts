import { describe, it, expect } from "vitest";
import type { BodyWeight, Workout, WorkoutKind, WorkoutSet } from "../../types";
import {
  byBodyFat,
  cardioBests,
  cardioSessions,
  e1rm,
  exerciseProgress,
  formatClock,
  formatMinutes,
  leanMassKg,
  movingAverage,
  joinDuration,
  paceLabel,
  splitDuration,
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

describe("joinDuration", () => {
  const d = (h: string, m: string, s = "") => joinDuration({ h, m, s });
  it("adds up hours, minutes and seconds", () => {
    expect(d("1", "5", "30")).toBe(3930);
    expect(d("", "25", "30")).toBe(1530);
    expect(d("1", "")).toBe(3600);
  });
  it("lets minutes and seconds run past 59", () => {
    expect(d("", "90")).toBe(5400);
    expect(d("", "", "90")).toBe(90);
  });
  it("is null when nothing (or only zeros) was entered", () => {
    expect(d("", "")).toBeNull();
    expect(d(" ", "", "")).toBeNull();
    expect(d("0", "0", "0")).toBeNull();
  });
  it("is NaN for anything but whole, non-negative numbers", () => {
    expect(d("1.5", "")).toBeNaN();
    expect(d("", "-5")).toBeNaN();
    expect(d("", "abc")).toBeNaN();
  });
});

describe("splitDuration", () => {
  it("fills hours, minutes and seconds for cardio", () => {
    expect(splitDuration(3930, true)).toEqual({ h: "1", m: "5", s: "30" });
    expect(splitDuration(1530, true)).toEqual({ h: "", m: "25", s: "30" });
  });
  it("rounds to the minute without a seconds box", () => {
    expect(splitDuration(2730, false)).toEqual({ h: "", m: "46", s: "" });
    expect(splitDuration(3570, false)).toEqual({ h: "1", m: "0", s: "" });
  });
  it("is blank with no duration", () => {
    expect(splitDuration(null, true)).toEqual({ h: "", m: "", s: "" });
  });
  it("round-trips", () => {
    expect(joinDuration(splitDuration(3930, true))).toBe(3930);
    expect(joinDuration(splitDuration(2700, false))).toBe(2700);
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

  // Body fat is optional, so only some weigh-ins have it.
  const withFat: BodyWeight[] = [
    { ...w("2026-08-01", 85), bodyFatPct: 21.0 },
    w("2026-08-20", 84.1),
    { ...w("2026-09-01", 83.4), bodyFatPct: 20.2 },
    { ...w("2026-10-01", 82.0), bodyFatPct: 19.1 },
    w("2026-10-05", 81.8),
  ];
  it("tracks body fat across only the weigh-ins that measured it", () => {
    expect(weightChange(withFat, 30, byBodyFat)).toBe(-1.1); // 19.1 vs 20.2
    expect(weightChange(withFat, 60, byBodyFat)).toBe(-1.9); // vs 21.0
    expect(movingAverage(withFat, 2, byBodyFat)).toEqual([21, 20.6, 19.65]);
  });
  it("still compares weight across every weigh-in", () => {
    expect(weightChange(withFat, 30)).toBe(-1.6); // 81.8 vs 83.4
  });
  it("has no body-fat change with fewer than two readings", () => {
    expect(weightChange([w("2026-10-01", 80), { ...w("2026-10-02", 80), bodyFatPct: 18 }], 1, byBodyFat)).toBeNull();
  });
  it("works out lean mass", () => {
    expect(leanMassKg(82, 19.1)).toBe(66.3);
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
