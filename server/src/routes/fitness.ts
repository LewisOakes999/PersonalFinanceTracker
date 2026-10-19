import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { resolveRange } from "../lib/range.js";
import { toNumber } from "../lib/serialize.js";

export const fitnessRouter = Router();

export const WORKOUT_KINDS = ["strength", "run", "cycle", "swim", "walk", "class", "sport", "other"] as const;
type Kind = (typeof WORKOUT_KINDS)[number];
// Only these record a distance; only strength records sets.
const DISTANCE_KINDS = new Set<Kind>(["run", "cycle", "swim", "walk"]);

const DAY_MS = 24 * 60 * 60 * 1000;

const setsInput = z
  .array(
    z.object({
      exercise: z.string().trim().min(1).max(60),
      reps: z.number().int().min(1).max(1000),
      weightKg: z.number().min(0).max(1000),
    })
  )
  .max(300)
  .default([]);

// An interval run's reps in order: a distance, a time, or both (e.g. 800 m in
// 3:05, or a 2-minute effort). The recovery between reps applies to them all.
const intervalsInput = z
  .array(
    z
      .object({
        distanceM: z.number().int().min(1).max(100_000).nullable(),
        durationSec: z.number().int().min(1).max(24 * 60 * 60).nullable(),
      })
      .refine((r) => r.distanceM !== null || r.durationSec !== null, {
        message: "Each rep needs a distance or a time.",
      })
  )
  .max(100)
  .default([]);
const recoveryInput = z.number().int().min(1).max(60 * 60).nullable().optional();

const workoutInput = z.object({
  date: z.coerce.date(),
  kind: z.enum(WORKOUT_KINDS),
  title: z.string().trim().max(80).default(""),
  durationSec: z.number().int().min(1).max(24 * 60 * 60).nullable().optional(),
  distanceKm: z.number().positive().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sets: setsInput,
  intervals: intervalsInput,
  recoverySec: recoveryInput,
});
type WorkoutInput = z.infer<typeof workoutInput>;

/** Keep only the fields that make sense for the kind, and reject the impossible. */
function normalise(data: WorkoutInput) {
  // A day's grace so "today" in a timezone ahead of UTC isn't treated as the future.
  if (data.date.getTime() > Date.now() + DAY_MS) {
    throw new HttpError(400, "A workout can't be dated in the future.");
  }
  const strength = data.kind === "strength";
  if (strength && data.sets.length === 0) {
    throw new HttpError(400, "Add at least one exercise with a set.");
  }
  return {
    date: data.date,
    kind: data.kind,
    title: data.title,
    durationSec: data.durationSec ?? null,
    distanceKm: DISTANCE_KINDS.has(data.kind) ? (data.distanceKm ?? null) : null,
    notes: data.notes || null,
    sets: strength ? data.sets : [],
    ...intervalFields(data),
  };
}

/** Reps belong to runs only; recovery only means something with reps. */
function intervalFields(data: {
  kind: Kind;
  intervals: z.infer<typeof intervalsInput>;
  recoverySec?: number | null;
}) {
  const intervals = data.kind === "run" ? data.intervals : [];
  return { intervals, recoverySec: intervals.length > 0 ? (data.recoverySec ?? null) : null };
}

const include = { sets: { orderBy: { position: "asc" as const } } };

type WorkoutRow = Prisma.WorkoutGetPayload<{ include: { sets: true } }>;

/** Decimals → numbers for the client. */
function shape(w: WorkoutRow) {
  return {
    ...w,
    distanceKm: w.distanceKm === null ? null : toNumber(w.distanceKm),
    sets: w.sets.map((s) => ({ ...s, weightKg: toNumber(s.weightKg) })),
  };
}

const setRows = (sets: WorkoutInput["sets"]) =>
  sets.map((s, position) => ({ position, exercise: s.exercise, reps: s.reps, weightKg: s.weightKg }));

// GET /api/fitness/workouts?start=&end= — newest first, with their sets.
fitnessRouter.get(
  "/workouts",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const range = resolveRange(req);
    const workouts = await prisma.workout.findMany({
      where: { userId, ...(range ? { date: { gte: range.start, lt: range.end } } : {}) },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include,
    });
    res.json(workouts.map(shape));
  })
);

fitnessRouter.post(
  "/workouts",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { sets, ...data } = normalise(workoutInput.parse(req.body));
    const workout = await prisma.workout.create({
      data: { ...data, userId, sets: { create: setRows(sets) } },
      include,
    });
    res.status(201).json(shape(workout));
  })
);

// Sets are replaced wholesale — the form always sends the full workout.
fitnessRouter.put(
  "/workouts/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { sets, ...data } = normalise(workoutInput.parse(req.body));
    const existing = await prisma.workout.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new HttpError(404, "Workout not found");
    const [, workout] = await prisma.$transaction([
      prisma.workoutSet.deleteMany({ where: { workoutId: existing.id } }),
      prisma.workout.update({
        where: { id: existing.id },
        data: { ...data, sets: { create: setRows(sets) } },
        include,
      }),
    ]);
    res.json(shape(workout));
  })
);

fitnessRouter.delete(
  "/workouts/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.workout.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Workout not found");
    res.status(204).end();
  })
);

// GET /api/fitness/exercises — every exercise name used, most recent first,
// one spelling each (case-insensitive) — for autocomplete.
fitnessRouter.get(
  "/exercises",
  asyncHandler(async (req, res) => {
    const sets = await prisma.workoutSet.findMany({
      where: { workout: { userId: getUserId(req) } },
      select: { exercise: true, workout: { select: { date: true } } },
      orderBy: { workout: { date: "desc" } },
    });
    const seen = new Map<string, string>();
    for (const s of sets) {
      const key = s.exercise.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, s.exercise.trim());
    }
    res.json([...seen.values()]);
  })
);

// Body weight — one entry per day; logging the same day again replaces it.
const weightInput = z.object({
  date: z.coerce.date(),
  weightKg: z.number().min(20).max(400),
  bodyFatPct: z.number().min(2).max(75).nullable().optional(),
});

const shapeWeight = (r: { weightKg: Prisma.Decimal; bodyFatPct: Prisma.Decimal | null }) => ({
  ...r,
  weightKg: toNumber(r.weightKg),
  bodyFatPct: r.bodyFatPct === null ? null : toNumber(r.bodyFatPct),
});

fitnessRouter.get(
  "/body-weights",
  asyncHandler(async (req, res) => {
    const rows = await prisma.bodyWeight.findMany({
      where: { userId: getUserId(req) },
      orderBy: { date: "asc" },
    });
    res.json(rows.map(shapeWeight));
  })
);

fitnessRouter.post(
  "/body-weights",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { date, weightKg, bodyFatPct = null } = weightInput.parse(req.body);
    if (date.getTime() > Date.now() + DAY_MS) {
      throw new HttpError(400, "A weigh-in can't be dated in the future.");
    }
    // Logging a day again replaces that day's entry outright, body fat included.
    const row = await prisma.bodyWeight.upsert({
      where: { userId_date: { userId, date } },
      update: { weightKg, bodyFatPct },
      create: { userId, date, weightKg, bodyFatPct },
    });
    res.status(201).json(shapeWeight(row));
  })
);

fitnessRouter.delete(
  "/body-weights/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.bodyWeight.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Weigh-in not found");
    res.status(204).end();
  })
);

// Presets — saved workouts to start from. Saving under an existing name
// updates that preset, which is also how a preset is edited.
const presetInput = z.object({
  name: z.string().trim().min(1).max(60),
  kind: z.enum(WORKOUT_KINDS),
  title: z.string().trim().max(80).default(""),
  durationSec: z.number().int().min(1).max(24 * 60 * 60).nullable().optional(),
  distanceKm: z.number().positive().max(1000).nullable().optional(),
  sets: setsInput,
  intervals: intervalsInput,
  recoverySec: recoveryInput,
});

type PresetRow = Prisma.WorkoutPresetGetPayload<object>;
const shapePreset = (p: PresetRow) => ({
  ...p,
  distanceKm: p.distanceKm === null ? null : toNumber(p.distanceKm),
});

fitnessRouter.get(
  "/presets",
  asyncHandler(async (req, res) => {
    const presets = await prisma.workoutPreset.findMany({
      where: { userId: getUserId(req) },
      orderBy: { name: "asc" },
    });
    res.json(presets.map(shapePreset));
  })
);

fitnessRouter.post(
  "/presets",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = presetInput.parse(req.body);
    const strength = data.kind === "strength";
    if (strength && data.sets.length === 0) {
      throw new HttpError(400, "Add at least one exercise with a set before saving it as a preset.");
    }
    const fields = {
      kind: data.kind,
      title: data.title,
      durationSec: data.durationSec ?? null,
      distanceKm: DISTANCE_KINDS.has(data.kind) ? (data.distanceKm ?? null) : null,
      sets: strength ? data.sets : [],
      ...intervalFields(data),
    };
    const preset = await prisma.workoutPreset.upsert({
      where: { userId_name: { userId, name: data.name } },
      update: fields,
      create: { userId, name: data.name, ...fields },
    });
    res.status(201).json(shapePreset(preset));
  })
);

fitnessRouter.delete(
  "/presets/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.workoutPreset.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Preset not found");
    res.status(204).end();
  })
);
