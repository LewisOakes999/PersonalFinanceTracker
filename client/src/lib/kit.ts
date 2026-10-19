import type { Gear, Workout, WorkoutKind } from "../types";
import { effectiveKm } from "./fitness";

// Kit: how far each pair of shoes or bike has gone, and what it has cost per
// km and per session — the price from Money spread over the workouts from
// Health. Pure, like the rest of the fitness maths. Dates are calendar days at
// midnight UTC.

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (iso: string | Date) => Math.floor(new Date(iso).getTime() / DAY_MS);
const RATE_WINDOW = 56; // judge how fast it's wearing on the last 8 weeks

export interface KitStats {
  gear: Gear;
  sessions: number; // workouts logged with it
  word: string; // what one of them is called: "run", "ride", "session"…
  km: number; // in total, including what was on it when added
  seconds: number;
  costPerKm: number | null;
  costPerSession: number | null;
  wear: number | null; // share of its lifespan used; can pass 1
  kmLeft: number | null;
  firstUsed: string | null;
  lastUsed: string | null;
  kmPerWeek: number | null; // lately
  replaceOn: string | null; // when it reaches its lifespan at that rate
}

export function kitStats(gear: Gear, workouts: Workout[], now = new Date()): KitStats {
  const today = dayOf(now);
  const used = workouts.filter((w) => w.gearId === gear.id).sort((a, b) => a.date.localeCompare(b.date));
  const loggedKm = used.reduce((s, w) => s + (effectiveKm(w) ?? 0), 0);
  const km = gear.startKm + loggedKm;
  const price = gear.price;

  // How fast it's clocking up distance: the last 8 weeks, or since its first
  // outing if that's more recent (but at least a week, so one run isn't a rate).
  let kmPerWeek: number | null = null;
  if (used.length > 0) {
    const from = Math.max(today - RATE_WINDOW + 1, dayOf(used[0].date)); // the window's first day
    const span = Math.max(7, today - from + 1);
    const recent = used.filter((w) => dayOf(w.date) > today - RATE_WINDOW);
    const recentKm = recent.reduce((s, w) => s + (effectiveKm(w) ?? 0), 0);
    kmPerWeek = recentKm > 0 ? (recentKm / span) * 7 : null;
  }

  const kmLeft = gear.lifespanKm ? gear.lifespanKm - km : null;
  let replaceOn: string | null = null;
  if (!gear.retiredAt && kmLeft !== null && kmLeft > 0 && kmPerWeek) {
    const days = Math.ceil(kmLeft / (kmPerWeek / 7));
    replaceOn = new Date((today + days) * DAY_MS).toISOString().slice(0, 10);
  }

  return {
    gear,
    sessions: used.length,
    // Shoes for runs that also did a hybrid session have done "sessions", not "runs".
    word: sessionWord([...new Set([...gear.kinds, ...used.map((w) => w.kind)])]),
    km,
    seconds: used.reduce((s, w) => s + (w.durationSec ?? 0), 0),
    costPerKm: price !== null && km > 0 ? price / km : null,
    costPerSession: price !== null && used.length > 0 ? price / used.length : null,
    wear: gear.lifespanKm ? km / gear.lifespanKm : null,
    kmLeft,
    firstUsed: used[0]?.date ?? null,
    lastUsed: used[used.length - 1]?.date ?? null,
    kmPerWeek,
    replaceOn,
  };
}

// A hybrid session is runs and stations, so the shoes you run or lift in suit
// it too, without marking every pair for hybrid as well.
const ALSO_SUITS: Partial<Record<WorkoutKind, WorkoutKind[]>> = { hybrid: ["run", "strength"] };

/** Is this kit meant for a workout of this kind? */
export const suits = (g: Gear, kind: WorkoutKind) =>
  g.kinds.includes(kind) || (ALSO_SUITS[kind] ?? []).some((k) => g.kinds.includes(k));

/** Kit that can be picked for a workout of this kind: in use, and meant for it. */
export const kitFor = (kind: WorkoutKind, gear: Gear[]) => gear.filter((g) => !g.retiredAt && suits(g, kind));

/**
 * What to pick for a new workout: whatever you last used for this kind (if
 * it's still in use) — for a first hybrid session, what you last ran in, then
 * lifted in — or the only option when there's just one.
 */
export function defaultKit(kind: WorkoutKind, gear: Gear[], workouts: Workout[]): string | null {
  const options = kitFor(kind, gear);
  const ids = new Set(options.map((g) => g.id));
  const newest = [...workouts]
    .filter((w) => w.gearId && ids.has(w.gearId))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const k of [kind, ...(ALSO_SUITS[kind] ?? [])]) {
    const last = newest.find((w) => w.kind === k);
    if (last) return last.gearId;
  }
  return options.length === 1 ? options[0].id : null;
}

/** "a run", "a ride", "a session" — what one use of this kit is called. */
export function sessionWord(kinds: WorkoutKind[]): string {
  if (kinds.length === 1 && kinds[0] === "run") return "run";
  if (kinds.length === 1 && kinds[0] === "cycle") return "ride";
  if (kinds.length === 1 && kinds[0] === "swim") return "swim";
  if (kinds.length === 1 && kinds[0] === "walk") return "walk";
  return "session";
}
