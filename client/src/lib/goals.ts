import type { BodyWeight, FitnessGoal, Workout } from "../types";
import { e1rm, formatClock, isIntervalRun, kindInfo, movingAverage, weekStart } from "./fitness";

// Fitness goals: where each one stands, and when you'd reach it at your
// current rate. Like the rest of the fitness maths this is pure, so it can be
// tested on its own. Dates are calendar days at midnight UTC; the maths runs on
// whole day numbers.

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (iso: string | Date) => Math.floor(new Date(iso).getTime() / DAY_MS);
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

/** Lifts and times are judged on recent form; weight moves faster, so a shorter look back. */
const PERFORMANCE_WINDOW = 84; // 12 weeks
const BODY_WINDOW = 42; // 6 weeks
const MIN_POINTS = 3;
const MIN_SPAN = 14; // days the points must cover before a trend means anything
const FAR = 3 * 365; // beyond this, a date would be false precision
// A GPS watch often reads a parkrun as 4.98 km; that still counts as a 5 km
// effort, with its time scaled up to the full distance.
const DISTANCE_SLACK = 0.98;

export type Better = "up" | "down";

/** A point the trend is fitted to: a week's best effort, or a weigh-in. */
export interface GoalPoint {
  day: number;
  date: string;
  value: number;
}

export type Outlook =
  | { state: "reached"; date: string; workoutId: string | null }
  | { state: "due" } // the trend is already there; the next good effort should do it
  | { state: "projected"; date: string; days: number }
  | { state: "stalled" } // not improving over the window
  | { state: "far" } // more than three years away at this rate
  | { state: "needData"; points: number }; // too little recent data for a trend

export interface GoalStatus {
  goal: FitnessGoal;
  better: Better;
  target: number; // in the goal's measure: est. max kg, reps, seconds, kg or %
  start: number | null; // where you were when you set it
  current: number | null; // where you are now
  progress: number; // 0–1 of the way from start to target
  points: GoalPoint[]; // what the trend is fitted to, oldest first
  trend: { slope: number; at: (day: number) => number } | null; // value per day
  ratePerDay: number | null; // improvement per day; negative means going backwards
  outlook: Outlook;
  deadline: { date: string; daysLeft: number; onTrack: boolean; neededPerDay: number | null } | null;
  windowDays: number;
}

/** Least squares straight line through the points; null if they share a day. */
export function linearFit(points: { day: number; value: number }[]) {
  const n = points.length;
  if (n < 2) return null;
  const mt = points.reduce((s, p) => s + p.day, 0) / n;
  const mv = points.reduce((s, p) => s + p.value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.day - mt) ** 2;
    sxy += (p.day - mt) * (p.value - mv);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, at: (day: number) => mv + slope * (day - mt) };
}

interface Effort extends GoalPoint {
  workoutId: string;
  meets: boolean; // this session reached the goal
}

/** Every session that says something about a lift or time goal, oldest first. */
function efforts(goal: FitnessGoal, workouts: Workout[]): Effort[] {
  const ordered = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  const out: Effort[] = [];
  if (goal.type === "strength") {
    const key = (goal.exercise ?? "").trim().toLowerCase();
    const reps = goal.reps ?? 1;
    const weight = goal.weightKg; // null: a bodyweight move, judged on reps
    for (const w of ordered) {
      const sets = w.sets.filter((s) => s.exercise.trim().toLowerCase() === key);
      if (sets.length === 0) continue;
      const value =
        weight === null ? Math.max(...sets.map((s) => s.reps)) : Math.max(...sets.map((s) => e1rm(s.weightKg, s.reps)));
      if (value <= 0) continue;
      const meets = sets.some((s) => s.reps >= reps && (weight === null || s.weightKg >= weight));
      out.push({ day: dayOf(w.date), date: w.date, value, workoutId: w.id, meets });
    }
  } else if (goal.type === "cardio") {
    const dist = goal.distanceKm ?? 0;
    for (const w of ordered) {
      // Interval runs include their recoveries, so their overall time says nothing here.
      if (w.kind !== goal.kind || isIntervalRun(w) || !w.distanceKm || !w.durationSec) continue;
      if (w.distanceKm < dist * DISTANCE_SLACK) continue;
      const value = (w.durationSec / w.distanceKm) * dist; // time at the goal distance, at this pace
      out.push({ day: dayOf(w.date), date: w.date, value, workoutId: w.id, meets: value <= (goal.timeSec ?? 0) });
    }
  }
  return out;
}

const better = (a: number, b: number, dir: Better) => (dir === "up" ? a > b : a < b);
const bestOf = <T extends GoalPoint>(xs: T[], dir: Better) =>
  xs.reduce<T | null>((best, x) => (!best || better(x.value, best.value, dir) ? x : best), null);

/** Each week's best effort — so an easy run or a light day doesn't drag the trend down. */
function weeklyBests(xs: Effort[], dir: Better): GoalPoint[] {
  const weeks = new Map<number, Effort>();
  for (const x of xs) {
    const wk = weekStart(new Date(x.date)).getTime();
    const cur = weeks.get(wk);
    if (!cur || better(x.value, cur.value, dir)) weeks.set(wk, x);
  }
  return [...weeks.values()].sort((a, b) => a.day - b.day).map(({ day, date, value }) => ({ day, date, value }));
}

/** Where a goal stands, and when you'd reach it if you keep improving as you have lately. */
export function goalStatus(goal: FitnessGoal, workouts: Workout[], weights: BodyWeight[], now = new Date()): GoalStatus {
  const today = dayOf(now);
  const startDay = dayOf(goal.startDate);
  let dir: Better;
  let target: number;
  let start: number | null;
  let current: number | null;
  let points: GoalPoint[];
  let reached: { date: string; workoutId: string | null } | null;
  let windowDays: number;

  if (goal.type === "body") {
    const pick = (p: BodyWeight) => (goal.measure === "bodyFat" ? p.bodyFatPct : p.weightKg);
    const readings = [...weights]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((p) => pick(p) !== null && pick(p) !== undefined);
    const trend = movingAverage(readings, 7, pick); // lines up with `readings`
    target = goal.target ?? 0;
    windowDays = BODY_WINDOW;
    // Start from the trend before the day it was set (or the first weigh-in
    // after), so weighing in that day can't move the starting line.
    let s = -1;
    readings.forEach((r, i) => {
      if (dayOf(r.date) < startDay) s = i;
    });
    if (s === -1 && readings.length > 0) s = 0;
    start = s === -1 ? null : trend[s];
    current = trend.length ? trend[trend.length - 1] : null;
    // Lose or gain is read from where you were when you set it.
    dir = (start ?? current ?? target) >= target ? "down" : "up";
    const hit = readings.findIndex(
      (r, i) => dayOf(r.date) >= startDay && (dir === "down" ? trend[i] <= target : trend[i] >= target)
    );
    reached = hit === -1 ? null : { date: readings[hit].date, workoutId: null };
    points = readings
      .filter((r) => dayOf(r.date) > today - windowDays)
      .map((r) => ({ day: dayOf(r.date), date: r.date, value: pick(r)! }));
  } else {
    dir = goal.type === "cardio" ? "down" : "up";
    target =
      goal.type === "cardio"
        ? (goal.timeSec ?? 0)
        : goal.weightKg === null
          ? (goal.reps ?? 1)
          : e1rm(goal.weightKg, goal.reps ?? 1);
    windowDays = PERFORMANCE_WINDOW;
    const xs = efforts(goal, workouts);
    // Where you stood: your best in the 12 weeks before, or failing that your first go after.
    const before = xs.filter((x) => x.day < startDay && x.day >= startDay - windowDays);
    start = bestOf(before, dir)?.value ?? xs.find((x) => x.day >= startDay)?.value ?? null;
    const recent = xs.filter((x) => x.day > today - windowDays);
    current = bestOf(recent, dir)?.value ?? null;
    const hit = xs.find((x) => x.day >= startDay && x.meets);
    reached = hit ? { date: hit.date, workoutId: hit.workoutId } : null;
    points = weeklyBests(recent, dir);
  }

  const fit = points.length >= MIN_POINTS && points[points.length - 1].day - points[0].day >= MIN_SPAN ? linearFit(points) : null;
  const ratePerDay = fit ? (dir === "up" ? fit.slope : -fit.slope) : null;
  const nowValue = fit ? fit.at(today) : current;
  const toGo = nowValue === null ? null : dir === "up" ? target - nowValue : nowValue - target;

  let outlook: Outlook;
  if (reached) outlook = { state: "reached", ...reached };
  else if (!fit || toGo === null || ratePerDay === null) outlook = { state: "needData", points: points.length };
  else if (toGo <= 0) outlook = { state: "due" };
  else if (ratePerDay <= 0) outlook = { state: "stalled" };
  else {
    const days = Math.ceil(toGo / ratePerDay - 1e-9); // the epsilon stops 49.000000001 becoming 50
    outlook = days > FAR ? { state: "far" } : { state: "projected", date: isoOf(today + days), days };
  }

  let progress = 0;
  if (reached) progress = 1;
  else if (start !== null && current !== null) {
    const span = target - start;
    const done = dir === "up" ? current >= target : current <= target;
    progress = span === 0 ? (done ? 1 : 0) : Math.min(1, Math.max(0, (current - start) / span));
  }

  let deadline: GoalStatus["deadline"] = null;
  if (goal.deadline && !reached) {
    const daysLeft = dayOf(goal.deadline) - today;
    const onTrack =
      outlook.state === "due" || (outlook.state === "projected" && today + outlook.days <= dayOf(goal.deadline));
    deadline = {
      date: goal.deadline,
      daysLeft,
      onTrack,
      neededPerDay: toGo !== null && toGo > 0 && daysLeft > 0 ? toGo / daysLeft : null,
    };
  }

  return {
    goal,
    better: dir,
    target,
    start,
    current,
    progress,
    points,
    trend: fit,
    ratePerDay,
    outlook,
    deadline,
    windowDays,
  };
}

// ── Words and numbers ──────────────────────────────────────────────────────

const kg = (n: number) => `${parseFloat(n.toFixed(1))} kg`;
const km = (n: number) => `${parseFloat(n.toFixed(2))} km`;

/** "Bench press 100 kg", "Squat 140 kg × 3", "Pull-ups × 15", "5 km run in 20:00", "Body weight 80 kg". */
export function goalTitle(g: FitnessGoal): string {
  if (g.type === "strength") {
    const name = g.exercise ?? "Lift";
    if (g.weightKg === null) return `${name} × ${g.reps ?? 1}`;
    return (g.reps ?? 1) === 1 ? `${name} ${kg(g.weightKg)}` : `${name} ${kg(g.weightKg)} × ${g.reps}`;
  }
  if (g.type === "cardio") {
    const kind = kindInfo(g.kind ?? "run").label.toLowerCase();
    return `${km(g.distanceKm ?? 0)} ${kind} in ${formatClock(g.timeSec ?? 0)}`;
  }
  return g.measure === "bodyFat" ? `Body fat ${g.target}%` : `Body weight ${kg(g.target ?? 0)}`;
}

/** What a goal's numbers measure: "Estimated max", "Best 5 km", "Trend weight"… */
export function measureLabel(g: FitnessGoal): string {
  if (g.type === "strength") return g.weightKg === null ? "Most reps" : "Estimated max";
  if (g.type === "cardio") return `Best ${km(g.distanceKm ?? 0)}`;
  return g.measure === "bodyFat" ? "Trend body fat" : "Trend weight";
}

/** A value in the goal's measure: "96.5 kg", "12 reps", "20:45", "81.3 kg", "18.2%". */
export function formatGoalValue(g: FitnessGoal, v: number): string {
  if (g.type === "strength") return g.weightKg === null ? `${Math.floor(v)} reps` : kg(v);
  if (g.type === "cardio") return formatClock(v);
  return g.measure === "bodyFat" ? `${v.toFixed(1)}%` : `${v.toFixed(1)} kg`;
}

/**
 * A rate of improvement in words: lifts and times per month (they move
 * slowly), weight per week. `perDay` is improvement, so it's positive when
 * you're getting closer.
 */
export function formatGoalRate(g: FitnessGoal, perDay: number, dir: Better): string {
  const round = (n: number) => parseFloat(n.toFixed(1));
  if (g.type === "cardio") {
    const s = Math.round(Math.abs(perDay) * 30);
    return `${s} s ${perDay >= 0 ? "quicker" : "slower"} a month`;
  }
  if (g.type === "strength") {
    const n = round(perDay * 30);
    const unit = g.weightKg === null ? " reps" : " kg";
    return `${n >= 0 ? "+" : "−"}${Math.abs(n)}${unit} a month`;
  }
  // Body: show the actual change, so losing reads as a minus.
  const change = round((dir === "down" ? -perDay : perDay) * 7);
  return `${change > 0 ? "+" : change < 0 ? "−" : "±"}${Math.abs(change)}${g.measure === "bodyFat" ? "%" : " kg"} a week`;
}

/** Goals that the latest change pushed over the line. */
export function newlyReached(before: GoalStatus[], after: GoalStatus[]): GoalStatus[] {
  const was = new Set(before.filter((s) => s.outlook.state === "reached").map((s) => s.goal.id));
  return after.filter((s) => s.outlook.state === "reached" && !was.has(s.goal.id));
}
