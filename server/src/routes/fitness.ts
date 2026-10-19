import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { resolveRange } from "../lib/range.js";
import { toNumber } from "../lib/serialize.js";
import { getConversion } from "../lib/currency.js";

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
  gearId: z.string().min(1).nullable().optional(),
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
    gearId: data.gearId ?? null,
  };
}

/** Kit can only be your own. */
async function assertGear(userId: string, gearId: string | null) {
  if (gearId && !(await prisma.gear.findFirst({ where: { id: gearId, userId }, select: { id: true } }))) {
    throw new HttpError(400, "That kit wasn't found.");
  }
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
    await assertGear(userId, data.gearId);
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
    await assertGear(userId, data.gearId);
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

// Goals — a lift, a time over a distance, or a body weight or body fat figure.
// The client works out progress and projected dates from the logged data; the
// server keeps each goal's definition tidy.
const goalDates = {
  deadline: z.coerce.date().nullable().optional(),
  // The day it was set (calendar day, midnight UTC). Only used on create.
  startDate: z.coerce.date().optional(),
};
const goalInput = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("strength"),
      exercise: z.string().trim().min(1).max(60),
      weightKg: z.number().positive().max(1000).nullable(), // null for a bodyweight move
      reps: z.number().int().min(1).max(1000),
      ...goalDates,
    }),
    z.object({
      type: z.literal("cardio"),
      kind: z.enum(["run", "cycle", "swim", "walk"]),
      distanceKm: z.number().positive().max(1000),
      timeSec: z.number().int().min(1).max(7 * 24 * 60 * 60),
      ...goalDates,
    }),
    z.object({
      type: z.literal("body"),
      measure: z.enum(["weight", "bodyFat"]),
      target: z.number().positive(),
      ...goalDates,
    }),
  ])
  .superRefine((g, ctx) => {
    if (g.type !== "body") return;
    const [lo, hi] = g.measure === "weight" ? [20, 400] : [2, 75];
    if (g.target < lo || g.target > hi) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["target"],
        message: g.measure === "weight" ? "Enter a weight between 20 and 400 kg." : "Body fat should be between 2 and 75%.",
      });
    }
  });
type GoalInput = z.infer<typeof goalInput>;

/** Every column, so switching a goal's type clears the fields it no longer uses. */
function goalFields(g: GoalInput) {
  return {
    type: g.type,
    exercise: g.type === "strength" ? g.exercise : null,
    weightKg: g.type === "strength" ? g.weightKg : null,
    reps: g.type === "strength" ? g.reps : null,
    kind: g.type === "cardio" ? g.kind : null,
    distanceKm: g.type === "cardio" ? g.distanceKm : null,
    timeSec: g.type === "cardio" ? g.timeSec : null,
    measure: g.type === "body" ? g.measure : null,
    target: g.type === "body" ? g.target : null,
    deadline: g.deadline ?? null,
  };
}

function checkDeadline(deadline: Date | null, startDate: Date) {
  if (deadline && deadline < startDate) {
    throw new HttpError(400, "The deadline can't be before the day you set the goal.");
  }
}

type GoalRow = Prisma.FitnessGoalGetPayload<object>;
const shapeGoal = (g: GoalRow) => ({
  ...g,
  weightKg: g.weightKg === null ? null : toNumber(g.weightKg),
  distanceKm: g.distanceKm === null ? null : toNumber(g.distanceKm),
  target: g.target === null ? null : toNumber(g.target),
});

fitnessRouter.get(
  "/goals",
  asyncHandler(async (req, res) => {
    const goals = await prisma.fitnessGoal.findMany({
      where: { userId: getUserId(req) },
      orderBy: { createdAt: "asc" },
    });
    res.json(goals.map(shapeGoal));
  })
);

fitnessRouter.post(
  "/goals",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = goalInput.parse(req.body);
    const now = new Date();
    const startDate = data.startDate ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (startDate.getTime() > Date.now() + DAY_MS) throw new HttpError(400, "A goal can't start in the future.");
    const fields = goalFields(data);
    checkDeadline(fields.deadline, startDate);
    const goal = await prisma.fitnessGoal.create({ data: { ...fields, startDate, userId } });
    res.status(201).json(shapeGoal(goal));
  })
);

// Editing changes the target, never the day it was set.
fitnessRouter.put(
  "/goals/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const fields = goalFields(goalInput.parse(req.body));
    const existing = await prisma.fitnessGoal.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new HttpError(404, "Goal not found");
    checkDeadline(fields.deadline, existing.startDate);
    const goal = await prisma.fitnessGoal.update({ where: { id: existing.id }, data: fields });
    res.json(shapeGoal(goal));
  })
);

fitnessRouter.delete(
  "/goals/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.fitnessGoal.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Goal not found");
    res.status(204).end();
  })
);

// Kit — shoes, a bike — that workouts are logged with, optionally linked to
// the transaction that bought it. Distance and cost per km are worked out on
// the client from the workouts that used it.
const gearInput = z.object({
  name: z.string().trim().min(1).max(60),
  kinds: z.array(z.enum(WORKOUT_KINDS)).min(1).max(WORKOUT_KINDS.length),
  transactionId: z.string().min(1).nullable().optional(),
  price: z.number().min(0).max(1_000_000).nullable().optional(),
  boughtOn: z.coerce.date().nullable().optional(),
  startKm: z.number().min(0).max(100_000).default(0),
  lifespanKm: z.number().int().min(1).max(100_000).nullable().optional(),
  retiredAt: z.coerce.date().nullable().optional(),
});

const gearInclude = {
  transaction: {
    select: { id: true, date: true, amount: true, description: true, account: { select: { name: true, currency: true } } },
  },
};
type GearRow = Prisma.GearGetPayload<{ include: typeof gearInclude }>;
const shapeGear = (g: GearRow) => ({
  ...g,
  kinds: [...new Set(g.kinds)],
  price: g.price === null ? null : toNumber(g.price),
  startKm: toNumber(g.startKm),
  transaction: g.transaction && { ...g.transaction, amount: toNumber(g.transaction.amount) },
});

async function gearFields(userId: string, data: z.infer<typeof gearInput>) {
  // A linked purchase must be one of your own spends.
  if (data.transactionId) {
    const txn = await prisma.transaction.findFirst({
      where: { id: data.transactionId, userId, type: "expense" },
      select: { id: true },
    });
    if (!txn) throw new HttpError(400, "That purchase wasn't found.");
  }
  return {
    name: data.name,
    kinds: [...new Set(data.kinds)],
    transactionId: data.transactionId ?? null,
    price: data.price ?? null,
    boughtOn: data.boughtOn ?? null,
    startKm: data.startKm,
    lifespanKm: data.lifespanKm ?? null,
    retiredAt: data.retiredAt ?? null,
  };
}

fitnessRouter.get(
  "/gear",
  asyncHandler(async (req, res) => {
    const gear = await prisma.gear.findMany({
      where: { userId: getUserId(req) },
      orderBy: { createdAt: "asc" },
      include: gearInclude,
    });
    res.json(gear.map(shapeGear));
  })
);

fitnessRouter.post(
  "/gear",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const fields = await gearFields(userId, gearInput.parse(req.body));
    const gear = await prisma.gear.create({ data: { ...fields, userId }, include: gearInclude });
    res.status(201).json(shapeGear(gear));
  })
);

fitnessRouter.put(
  "/gear/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const fields = await gearFields(userId, gearInput.parse(req.body));
    const existing = await prisma.gear.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new HttpError(404, "Kit not found");
    const gear = await prisma.gear.update({ where: { id: existing.id }, data: fields, include: gearInclude });
    res.json(shapeGear(gear));
  })
);

// Workouts that used it keep their place; they just lose the link.
fitnessRouter.delete(
  "/gear/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.gear.deleteMany({ where: { id: req.params.id, userId: getUserId(req) } });
    if (result.count === 0) throw new HttpError(404, "Kit not found");
    res.status(204).end();
  })
);

// What training costs: the spending categories that are for fitness (a gym
// membership, class passes), and the workouts each one pays for — so a month
// of gym fees divided by that month's gym visits gives the cost per visit.
const spendingInput = z
  .array(
    z.object({
      categoryId: z.string().min(1),
      kinds: z.array(z.enum(WORKOUT_KINDS)).max(WORKOUT_KINDS.length).default([]), // none: every workout
    })
  )
  .max(20);
type SpendingConfig = z.infer<typeof spendingInput>;

/** The saved choice, tolerating anything odd in the stored JSON. */
const readSpending = (json: unknown): SpendingConfig => {
  const parsed = spendingInput.safeParse(json);
  return parsed.success ? parsed.data : [];
};

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

// PUT /api/fitness/spending — choose the categories, and the workouts each pays for.
fitnessRouter.put(
  "/spending",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const config = spendingInput.parse(req.body);
    const unique = [...new Map(config.map((c) => [c.categoryId, { ...c, kinds: [...new Set(c.kinds)] }])).values()];
    const ids = unique.map((c) => c.categoryId);
    const found = await prisma.category.count({ where: { userId, id: { in: ids }, type: "expense" } });
    if (found !== ids.length) throw new HttpError(400, "Pick your own spending categories.");
    await prisma.settings.upsert({
      where: { userId },
      update: { fitnessSpending: unique },
      create: { userId, fitnessSpending: unique },
    });
    res.json(unique);
  })
);

// GET /api/fitness/spending?months=12 — each chosen category's spend per
// month, oldest first, in the main currency. Split transactions count their
// matching lines; a purchase linked to kit is left out, since the kit's own
// price already counts it.
fitnessRouter.get(
  "/spending",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const count = Math.min(36, Math.max(1, Math.floor(Number(req.query.months)) || 12));
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1), 1));
    const months = Array.from({ length: count }, (_, i) =>
      monthKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)))
    );
    const settings = await prisma.settings.findUnique({ where: { userId } });
    const config = readSpending(settings?.fitnessSpending);
    const ids = config.map((c) => c.categoryId);

    const [txns, categories, accounts, conv, linked] = await Promise.all([
      ids.length
        ? prisma.transaction.findMany({
            where: {
              userId,
              type: "expense",
              date: { gte: start, lte: now },
              OR: [{ categoryId: { in: ids } }, { splits: { some: { categoryId: { in: ids } } } }],
            },
            select: {
              id: true,
              date: true,
              amount: true,
              categoryId: true,
              accountId: true,
              splits: { select: { categoryId: true, amount: true } },
            },
          })
        : [],
      prisma.category.findMany({ where: { userId, id: { in: ids } } }),
      prisma.account.findMany({ where: { userId }, select: { id: true, currency: true } }),
      getConversion(userId),
      prisma.gear.findMany({ where: { userId, transactionId: { not: null } }, select: { transactionId: true } }),
    ]);
    const skip = new Set(linked.map((g) => g.transactionId));
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
    const totals = new Map(ids.map((id) => [id, months.map(() => 0)]));
    for (const t of txns) {
      if (skip.has(t.id)) continue;
      const i = months.indexOf(monthKey(t.date));
      if (i === -1) continue;
      const currency = currencyOf.get(t.accountId) ?? conv.base;
      const lines = t.splits.length > 0 ? t.splits : [{ categoryId: t.categoryId, amount: t.amount }];
      for (const line of lines) {
        const row = totals.get(line.categoryId);
        if (row) row[i] += conv.toBase(toNumber(line.amount), currency);
      }
    }
    const byId = new Map(categories.map((c) => [c.id, c]));
    res.json({
      baseCurrency: conv.base,
      months,
      categories: config
        .filter((c) => byId.has(c.categoryId))
        .map((c) => ({
          id: c.categoryId,
          name: byId.get(c.categoryId)!.name,
          color: byId.get(c.categoryId)!.color,
          kinds: c.kinds,
          totals: totals.get(c.categoryId)!.map((n) => Math.round(n * 100) / 100),
        })),
    });
  })
);
