import type { BodyWeight, Workout, WorkoutKind } from "../types";

// Everything here is pure, so the progress maths can be tested on its own.
// Dates are calendar days stored as midnight UTC, so all date maths is UTC.

const DAY_MS = 24 * 60 * 60 * 1000;

export type KindGroup = "strength" | "cardio" | "session";

export const KINDS: { id: WorkoutKind; label: string; group: KindGroup; placeholder: string }[] = [
  { id: "strength", label: "Strength", group: "strength", placeholder: "e.g. Push day" },
  { id: "run", label: "Run", group: "cardio", placeholder: "e.g. Parkrun" },
  { id: "cycle", label: "Cycle", group: "cardio", placeholder: "e.g. Commute" },
  { id: "swim", label: "Swim", group: "cardio", placeholder: "e.g. Lunchtime lengths" },
  { id: "walk", label: "Walk", group: "cardio", placeholder: "e.g. Hike" },
  { id: "class", label: "Class", group: "session", placeholder: "e.g. Yoga, HIIT, Spin" },
  { id: "sport", label: "Sport", group: "session", placeholder: "e.g. Football, Padel" },
  { id: "other", label: "Other", group: "session", placeholder: "What did you do?" },
];

export const kindInfo = (kind: WorkoutKind) => KINDS.find((k) => k.id === kind) ?? KINDS[KINDS.length - 1];
export const isCardio = (kind: WorkoutKind) => kindInfo(kind).group === "cardio";

// ── Durations ──────────────────────────────────────────────────────────────

/** The duration boxes as typed: hours, minutes and (for cardio) seconds. */
export type DurationParts = { h: string; m: string; s: string };

/**
 * Seconds from the duration boxes. All blank (or all zero) → null, meaning no
 * time logged; anything that isn't a whole, non-negative number → NaN. Minutes
 * and seconds may run past 59 — 90 minutes is fine — they're simply added up.
 */
export function joinDuration({ h, m, s }: DurationParts): number | null {
  const parts = [h, m, s].map((x) => x.trim());
  if (parts.every((x) => x === "")) return null;
  if (parts.some((x) => x !== "" && !/^\d+$/.test(x))) return NaN;
  const [hh, mm, ss] = parts.map((x) => (x === "" ? 0 : Number(x)));
  const total = hh * 3600 + mm * 60 + ss;
  return total > 0 ? total : null;
}

/**
 * A stored duration back into the boxes. Without a seconds box (gym, classes,
 * sports) it's rounded to the nearest minute.
 */
export function splitDuration(sec: number | null, withSeconds: boolean): DurationParts {
  if (sec === null || sec <= 0) return { h: "", m: "", s: "" };
  const total = withSeconds ? sec : Math.round(sec / 60) * 60;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return { h: h > 0 ? String(h) : "", m: String(m), s: withSeconds ? String(total % 60) : "" };
}

/** Clock style, for times where seconds matter: "25:30", "1:05:30". */
export function formatClock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** Friendly totals: "45 min", "1 h 5 min". */
export function formatMinutes(sec: number): string {
  const total = Math.round(sec / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ── Pace ───────────────────────────────────────────────────────────────────

/** Runs and walks: seconds per km. Swims: seconds per 100 m. Rides: km/h. */
export function paceValue(kind: WorkoutKind, km: number | null, sec: number | null): number | null {
  if (!km || !sec || km <= 0 || sec <= 0) return null;
  if (kind === "cycle") return km / (sec / 3600);
  if (kind === "swim") return sec / (km * 10);
  return sec / km;
}

/** For rides a higher number is better; for everything else, a lower one. */
export const paceHigherIsBetter = (kind: WorkoutKind) => kind === "cycle";

export function formatPace(kind: WorkoutKind, value: number): string {
  if (kind === "cycle") return `${value.toFixed(1)} km/h`;
  return `${formatClock(value)} ${kind === "swim" ? "/100m" : "/km"}`;
}

export function paceLabel(kind: WorkoutKind, km: number | null, sec: number | null): string | null {
  const v = paceValue(kind, km, sec);
  return v === null ? null : formatPace(kind, v);
}

// ── Weeks and streaks ──────────────────────────────────────────────────────

/** Monday 00:00 UTC of the week containing `d` (UK weeks run Monday–Sunday). */
export function weekStart(d: Date): Date {
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const weekday = (new Date(day).getUTCDay() + 6) % 7; // Monday = 0
  return new Date(day - weekday * DAY_MS);
}

export interface WeekSummary {
  start: Date;
  workouts: number;
  seconds: number;
  /** Distance per cardio kind that week. */
  km: Partial<Record<WorkoutKind, number>>;
}

/** The last `weeks` weeks, oldest first; the final entry is the current week. */
export function weeklySummary(workouts: Workout[], weeks: number, now = new Date()): WeekSummary[] {
  const current = weekStart(now).getTime();
  const out: WeekSummary[] = Array.from({ length: weeks }, (_, i) => ({
    start: new Date(current - (weeks - 1 - i) * 7 * DAY_MS),
    workouts: 0,
    seconds: 0,
    km: {},
  }));
  for (const w of workouts) {
    const idx = weeks - 1 - Math.round((current - weekStart(new Date(w.date)).getTime()) / (7 * DAY_MS));
    if (idx < 0 || idx >= weeks) continue;
    const wk = out[idx];
    wk.workouts++;
    wk.seconds += w.durationSec ?? 0;
    if (w.distanceKm) wk.km[w.kind] = (wk.km[w.kind] ?? 0) + w.distanceKm;
  }
  return out;
}

/**
 * Consecutive weeks hitting the goal, counting back from now. The current week
 * only counts once it's hit — until then it's still in progress, so it doesn't
 * break the streak either.
 */
export function streak(summary: WeekSummary[], goal: number): number {
  let i = summary.length - 1;
  if (i < 0) return 0;
  let n = 0;
  if (summary[i].workouts >= goal) n++;
  for (i -= 1; i >= 0 && summary[i].workouts >= goal; i--) n++;
  return n;
}

// ── Strength ───────────────────────────────────────────────────────────────

/** Estimated one-rep max (Epley). A single is taken at face value. */
export function e1rm(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export interface ExerciseSession {
  date: string;
  workoutId: string;
  topWeight: number; // heaviest set that day
  topReps: number; // reps at that weight
  bestE1rm: number;
  bestReps: number; // most reps in a set (for bodyweight moves)
  volume: number; // Σ reps × weight
  sets: number;
  pb: boolean; // beat every earlier session (e1RM, or reps for bodyweight moves)
}

export interface ExerciseProgress {
  key: string;
  name: string; // the most recent spelling
  bodyweight: boolean; // never done with added weight — progress is reps
  sessions: ExerciseSession[]; // oldest first
  heaviest: { kg: number; reps: number; date: string } | null;
  bestE1rm: { kg: number; date: string } | null;
  mostReps: { reps: number; date: string };
  lastDate: string;
}

/** Every exercise's history, matched case-insensitively, most recently done first. */
export function exerciseProgress(workouts: Workout[]): ExerciseProgress[] {
  const byKey = new Map<string, { name: string; sessions: ExerciseSession[] }>();
  const ordered = [...workouts].sort((a, b) => a.date.localeCompare(b.date));
  for (const w of ordered) {
    const perExercise = new Map<string, ExerciseSession & { name: string }>();
    for (const s of w.sets) {
      const key = s.exercise.trim().toLowerCase();
      if (!key) continue;
      const cur = perExercise.get(key) ?? {
        name: s.exercise.trim(),
        date: w.date,
        workoutId: w.id,
        topWeight: 0,
        topReps: 0,
        bestE1rm: 0,
        bestReps: 0,
        volume: 0,
        sets: 0,
        pb: false,
      };
      if (s.weightKg > cur.topWeight || (s.weightKg === cur.topWeight && s.reps > cur.topReps)) {
        cur.topWeight = s.weightKg;
        cur.topReps = s.reps;
      }
      cur.bestE1rm = Math.max(cur.bestE1rm, e1rm(s.weightKg, s.reps));
      cur.bestReps = Math.max(cur.bestReps, s.reps);
      cur.volume += s.reps * s.weightKg;
      cur.sets++;
      perExercise.set(key, cur);
    }
    for (const [key, { name, ...session }] of perExercise) {
      const entry = byKey.get(key) ?? { name, sessions: [] };
      entry.name = name; // later workouts win, so this ends as the latest spelling
      entry.sessions.push(session);
      byKey.set(key, entry);
    }
  }

  const result: ExerciseProgress[] = [];
  for (const [key, { name, sessions }] of byKey) {
    const bodyweight = sessions.every((s) => s.topWeight === 0);
    let heaviest: ExerciseProgress["heaviest"] = null;
    let bestE1rm: ExerciseProgress["bestE1rm"] = null;
    let mostReps = { reps: 0, date: sessions[0].date };
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      // A PB means beating every earlier session — the first one doesn't count.
      const score = bodyweight ? s.bestReps : s.bestE1rm;
      const prev = bodyweight ? mostReps.reps : (bestE1rm?.kg ?? 0);
      s.pb = i > 0 && score > prev;
      if (!heaviest || s.topWeight > heaviest.kg) heaviest = { kg: s.topWeight, reps: s.topReps, date: s.date };
      if (s.bestE1rm > 0 && (!bestE1rm || s.bestE1rm > bestE1rm.kg)) bestE1rm = { kg: s.bestE1rm, date: s.date };
      if (s.bestReps > mostReps.reps) mostReps = { reps: s.bestReps, date: s.date };
    }
    result.push({
      key,
      name,
      bodyweight,
      sessions,
      heaviest: bodyweight ? null : heaviest,
      bestE1rm,
      mostReps,
      lastDate: sessions[sessions.length - 1].date,
    });
  }
  return result.sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

// ── Cardio ─────────────────────────────────────────────────────────────────

export interface CardioSession {
  date: string;
  workoutId: string;
  title: string;
  km: number | null;
  sec: number | null;
  pace: number | null;
}

/** One kind's sessions, oldest first. */
export function cardioSessions(workouts: Workout[], kind: WorkoutKind): CardioSession[] {
  return workouts
    .filter((w) => w.kind === kind)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({
      date: w.date,
      workoutId: w.id,
      title: w.title,
      km: w.distanceKm,
      sec: w.durationSec,
      pace: paceValue(kind, w.distanceKm, w.durationSec),
    }));
}

export function cardioBests(sessions: CardioSession[], kind: WorkoutKind) {
  let longest: { km: number; date: string; workoutId: string } | null = null;
  let fastest: { pace: number; date: string; workoutId: string } | null = null;
  const better = (a: number, b: number) => (paceHigherIsBetter(kind) ? a > b : a < b);
  for (const s of sessions) {
    if (s.km && (!longest || s.km > longest.km)) longest = { km: s.km, date: s.date, workoutId: s.workoutId };
    if (s.pace !== null && (!fastest || better(s.pace, fastest.pace)))
      fastest = { pace: s.pace, date: s.date, workoutId: s.workoutId };
  }
  return { longest, fastest };
}

// ── Body weight ────────────────────────────────────────────────────────────

type Pick = (p: BodyWeight) => number | null | undefined;
const byWeight: Pick = (p) => p.weightKg;
export const byBodyFat: Pick = (p) => p.bodyFatPct;

/** Weigh-ins that recorded the measure, with its value. */
const measured = (points: BodyWeight[], pick: Pick) =>
  points.flatMap((p) => {
    const v = pick(p);
    return v === null || v === undefined ? [] : [{ date: p.date, v }];
  });

/** Trailing average over the last `window` readings, to smooth day-to-day noise. */
export function movingAverage(points: BodyWeight[], window = 7, pick: Pick = byWeight): number[] {
  const vals = measured(points, pick).map((m) => m.v);
  return vals.map((_, i) => {
    const slice = vals.slice(Math.max(0, i - window + 1), i + 1);
    return slice.reduce((s, v) => s + v, 0) / slice.length;
  });
}

/**
 * Change from the last reading on or before `days` before the latest one.
 * Null when there's no reading that far back to compare against. Weight by
 * default; pass `byBodyFat` for body fat (in percentage points).
 */
export function weightChange(points: BodyWeight[], days: number, pick: Pick = byWeight): number | null {
  const ms = measured(points, pick);
  if (ms.length < 2) return null;
  const latest = ms[ms.length - 1];
  const cutoff = new Date(latest.date).getTime() - days * DAY_MS;
  let base: (typeof ms)[number] | null = null;
  for (const m of ms) if (new Date(m.date).getTime() <= cutoff) base = m;
  return base ? Math.round((latest.v - base.v) * 10) / 10 : null;
}

/** Everything that isn't fat: weight × (1 − body fat). */
export const leanMassKg = (weightKg: number, bodyFatPct: number) =>
  Math.round(weightKg * (1 - bodyFatPct / 100) * 10) / 10;

// ── Display ────────────────────────────────────────────────────────────────

/** One-line summary for a workout in a list. */
export function workoutSummary(w: Workout): string {
  const parts: string[] = [];
  if (w.kind === "strength") {
    const exercises = new Set(w.sets.map((s) => s.exercise.trim().toLowerCase())).size;
    parts.push(`${exercises} exercise${exercises === 1 ? "" : "s"}`, `${w.sets.length} set${w.sets.length === 1 ? "" : "s"}`);
    if (w.durationSec) parts.push(formatMinutes(w.durationSec));
  } else if (isCardio(w.kind)) {
    if (w.distanceKm) parts.push(`${w.distanceKm.toFixed(2)} km`);
    if (w.durationSec) parts.push(formatClock(w.durationSec));
    const pace = paceLabel(w.kind, w.distanceKm, w.durationSec);
    if (pace) parts.push(pace);
  } else if (w.durationSec) {
    parts.push(formatMinutes(w.durationSec));
  }
  return parts.join(" · ");
}
