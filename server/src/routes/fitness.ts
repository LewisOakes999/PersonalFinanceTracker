import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
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

const workoutInput = z.object({
  date: z.coerce.date(),
  kind: z.enum(WORKOUT_KINDS),
  title: z.string().trim().max(80).default(""),
  durationSec: z.number().int().min(1).max(24 * 60 * 60).nullable().optional(),
  distanceKm: z.number().positive().max(1000).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sets: z
    .array(
      z.object({
        exercise: z.string().trim().min(1).max(60),
        reps: z.number().int().min(1).max(1000),
        weightKg: z.number().min(0).max(1000),
      })
    )
    .max(300)
    .default([]),
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
  };
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
});

fitnessRouter.get(
  "/body-weights",
  asyncHandler(async (req, res) => {
    const rows = await prisma.bodyWeight.findMany({
      where: { userId: getUserId(req) },
      orderBy: { date: "asc" },
    });
    res.json(rows.map((r) => ({ ...r, weightKg: toNumber(r.weightKg) })));
  })
);

fitnessRouter.post(
  "/body-weights",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { date, weightKg } = weightInput.parse(req.body);
    if (date.getTime() > Date.now() + DAY_MS) {
      throw new HttpError(400, "A weigh-in can't be dated in the future.");
    }
    const row = await prisma.bodyWeight.upsert({
      where: { userId_date: { userId, date } },
      update: { weightKg },
      create: { userId, date, weightKg },
    });
    res.status(201).json({ ...row, weightKg: toNumber(row.weightKg) });
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
