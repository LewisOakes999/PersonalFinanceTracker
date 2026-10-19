import { describe, it, expect } from "vitest";
import type { BodyWeight, IntervalRep, Workout, WorkoutKind, WorkoutSet } from "../../types";
import {
  byBodyFat,
  cardioBests,
  cardioSessions,
  e1rm,
  effectiveKm,
  exerciseProgress,
  exerciseVolumes,
  formatClock,
  formatMetres,
  formatMinutes,
  formatVolume,
  intervalSessions,
  intervalStats,
  intervalStructure,
  leanMassKg,
  movingAverage,
  joinDuration,
  paceLabel,
  repBests,
  setsVolume,
  splitDuration,
  streak,
  weekStart,
  weeklySummary,
  weightChange,
  workoutSummary,
  workoutVolume,
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
  intervals: [],
  recoverySec: null,
  gearId: null,
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

describe("volume", () => {
  const ss = [...sets("Bench press", [10, 20], [8, 25]), ...sets("Pull-ups", [10, 0]), ...sets("bench press", [5, 30])];

  it("is reps × weight, with bodyweight sets adding nothing", () => {
    expect(setsVolume(sets("Squat", [10, 20]))).toBe(200);
    expect(workoutVolume({ sets: ss })).toBe(10 * 20 + 8 * 25 + 5 * 30);
  });

  it("splits a workout by exercise, matching names in any case", () => {
    expect(exerciseVolumes(ss)).toEqual([
      { name: "Bench press", volume: 550, sets: 3, reps: 23 },
      { name: "Pull-ups", volume: 0, sets: 1, reps: 10 },
    ]);
  });

  it("adds up each week", () => {
    const weeks = weeklySummary(
      [workout("2026-10-13", "strength", { sets: ss }), workout("2026-10-14", "run", { distanceKm: 5 })],
      2,
      new Date(iso("2026-10-15"))
    );
    expect(weeks.map((w) => w.volume)).toEqual([0, 550]);
  });

  it("formats with thousands", () => {
    expect(formatVolume(12345.6)).toBe("12,346 kg");
  });
});

describe("workoutSummary", () => {
  it("summarises each kind of workout", () => {
    expect(
      workoutSummary(workout("2026-10-01", "strength", { durationSec: 3000, sets: [...sets("Squat", [5, 100], [5, 100]), ...sets("squat", [5, 100]), ...sets("Row", [8, 50])] }))
    ).toBe("2 exercises · 4 sets · 1,900 kg volume · 50 min"); // 3 × 5 × 100 + 8 × 50
    expect(workoutSummary(workout("2026-10-01", "run", { distanceKm: 5, durationSec: 1530 }))).toBe(
      "5.00 km · 25:30 · 5:06 /km"
    );
    expect(workoutSummary(workout("2026-10-01", "class", { durationSec: 3600 }))).toBe("1 h");
  });
});

describe("interval runs", () => {
  const rep = (distanceM: number | null, durationSec: number | null): IntervalRep => ({ distanceM, durationSec });
  const reps = (n: number, m: number, ...times: number[]): IntervalRep[] =>
    Array.from({ length: n }, (_, i) => rep(m, times[i] ?? null));

  it("names a session by its shape", () => {
    expect(intervalStructure(reps(6, 800))).toBe("6 × 800 m");
    expect(intervalStructure(reps(4, 1000))).toBe("4 × 1 km");
    expect(intervalStructure([200, 400, 600, 400, 200].map((m) => rep(m, null)))).toBe("200–400–600–400–200 m");
    expect(intervalStructure([rep(1000, null), rep(2000, null)])).toBe("1 km–2 km");
    expect(intervalStructure(Array.from({ length: 8 }, () => rep(null, 120)))).toBe("8 × 2:00");
    expect(intervalStructure([rep(400, null), rep(null, 60)])).toBe("2 reps");
    expect(formatMetres(1500)).toBe("1.5 km");
  });

  it("averages the reps and finds the fastest and slowest", () => {
    const s = intervalStats(reps(4, 800, 185, 183, 188, 180));
    expect(s.avgRepSec).toBe(184);
    expect(s.avgPace).toBe(230); // 736 s over 3.2 km
    expect([s.fastest, s.slowest]).toEqual([3, 2]);
    expect(s.spreadPace).toBeCloseTo((188 - 180) / 0.8, 6);
  });

  it("ranks a pyramid by pace, not raw time", () => {
    // 400 in 80 (3:20/km) is quicker than 200 in 42 (3:30/km), though slower in time
    const s = intervalStats([rep(200, 42), rep(400, 80), rep(200, 41)]);
    expect(s.fastest).toBe(1);
    expect(s.slowest).toBe(0);
  });

  it("handles time-only reps and untimed reps", () => {
    const t = intervalStats(Array.from({ length: 3 }, (_, i) => rep(null, 120 + i)));
    expect(t.avgRepSec).toBe(121);
    expect(t.avgPace).toBeNull();
    expect(t.fastest).toBeNull(); // no distance, so no speed to rank by
    const u = intervalStats(reps(3, 800));
    expect([u.avgRepSec, u.avgPace, u.fastest, u.spreadPace]).toEqual([null, null, null, null]);
  });

  it("names no fastest rep when every rep was the same", () => {
    const s = intervalStats(reps(4, 400, 80, 80, 80, 80));
    expect([s.fastest, s.slowest, s.spreadPace]).toEqual([null, null, 0]);
  });

  const run = (date: string, intervals: IntervalRep[], extra: Partial<Workout> = {}) =>
    workout(date, "run", { intervals, ...extra });

  it("flags a session that beats earlier ones of the same shape only", () => {
    const sessions = intervalSessions([
      run("2026-09-01", reps(6, 800, 190, 190, 190, 190, 190, 190)),
      run("2026-09-08", reps(4, 400, 85, 85, 85, 85)), // different shape: never compared
      run("2026-09-15", reps(6, 800, 186, 186, 186, 186, 186, 186)),
      run("2026-09-22", reps(6, 800, 188, 188, 188, 188, 188, 188)),
    ]);
    expect(sessions.map((s) => s.structure)).toEqual(["6 × 800 m", "4 × 400 m", "6 × 800 m", "6 × 800 m"]);
    expect(sessions.map((s) => s.pb)).toEqual([false, false, true, false]);
  });

  it("keeps the fastest rep at each distance", () => {
    const bests = repBests([
      run("2026-09-01", [rep(400, 84), rep(800, 182)]),
      run("2026-09-08", [rep(400, 82), rep(800, 185), rep(null, 60)]),
    ]);
    expect(bests.map((b) => [b.distanceM, b.sec, b.date.slice(0, 10)])).toEqual([
      [400, 82, "2026-09-08"],
      [800, 182, "2026-09-01"],
    ]);
  });

  it("counts reps as distance when no total was entered", () => {
    expect(effectiveKm(run("2026-09-01", reps(6, 800)))).toBe(4.8);
    expect(effectiveKm(run("2026-09-01", reps(6, 800), { distanceKm: 7 }))).toBe(7); // total incl. warm-up wins
    const weeks = weeklySummary([run("2026-10-13", reps(6, 800))], 1, new Date(iso("2026-10-14")));
    expect(weeks[0].km.run).toBe(4.8);
  });

  it("keeps interval runs out of steady-run pace", () => {
    const ws = [
      workout("2026-09-01", "run", { distanceKm: 5, durationSec: 1500 }),
      run("2026-09-02", reps(6, 800, 180, 180, 180, 180, 180, 180), { distanceKm: 8, durationSec: 2400 }),
    ];
    const sessions = cardioSessions(ws, "run");
    expect(sessions.map((x) => x.pace)).toEqual([300, null]);
    expect(cardioBests(sessions, "run").longest!.km).toBe(8); // still counts for distance
  });

  it("summarises an interval run by its reps", () => {
    expect(workoutSummary(run("2026-09-01", reps(2, 800, 184, 186)))).toBe("2 × 800 m · avg 3:05 · 3:51 /km");
  });
});
