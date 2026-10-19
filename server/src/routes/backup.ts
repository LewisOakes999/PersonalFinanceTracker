import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";

export const backupRouter = Router();

// GET /api/backup — full JSON dump of the user's data.
backupRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const [
      accounts,
      categories,
      recurring,
      recurringTransfers,
      transactions,
      splits,
      transfers,
      budgets,
      goals,
      valuations,
      rates,
      liabilities,
      assets,
      categoryRules,
      settings,
      workouts,
      workoutSets,
      bodyWeights,
      workoutPresets,
      fitnessGoals,
    ] = await Promise.all([
      prisma.account.findMany({ where: { userId } }),
      prisma.category.findMany({ where: { userId } }),
      prisma.recurringTransaction.findMany({ where: { userId } }),
      prisma.recurringTransfer.findMany({ where: { userId } }),
      prisma.transaction.findMany({ where: { userId } }),
      prisma.transactionSplit.findMany({ where: { transaction: { userId } } }),
      prisma.transfer.findMany({ where: { userId } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.goal.findMany({ where: { userId } }),
      prisma.accountValuation.findMany({ where: { userId } }),
      prisma.exchangeRate.findMany({ where: { userId } }),
      prisma.liability.findMany({ where: { userId } }),
      prisma.asset.findMany({ where: { userId } }),
      prisma.categoryRule.findMany({ where: { userId } }),
      prisma.settings.findUnique({ where: { userId } }),
      prisma.workout.findMany({ where: { userId } }),
      prisma.workoutSet.findMany({ where: { workout: { userId } } }),
      prisma.bodyWeight.findMany({ where: { userId } }),
      prisma.workoutPreset.findMany({ where: { userId } }),
      prisma.fitnessGoal.findMany({ where: { userId } }),
    ]);

    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      accounts,
      categories,
      recurring,
      recurringTransfers,
      transactions,
      splits,
      transfers,
      budgets,
      goals,
      valuations,
      rates,
      liabilities,
      assets,
      categoryRules,
      settings,
      workouts,
      workoutSets,
      bodyWeights,
      workoutPresets,
      fitnessGoals,
    });
  })
);

// POST /api/backup/restore — REPLACE all of the user's data with the backup.
backupRouter.post(
  "/restore",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = req.body;
    if (!data || typeof data !== "object" || !Array.isArray(data.accounts)) {
      throw new HttpError(400, "Invalid backup file.");
    }

    // A restore inserts straight from the uploaded file, so cap the row count —
    // otherwise one 25 MB upload could write millions of rows.
    const MAX_ROWS = 200_000;
    const totalRows = Object.values(data).reduce<number>(
      (n, v) => n + (Array.isArray(v) ? v.length : 0),
      0
    );
    if (totalRows > MAX_ROWS) {
      throw new HttpError(
        413,
        `Backup is too large to restore (${totalRows.toLocaleString()} rows, limit ${MAX_ROWS.toLocaleString()}).`
      );
    }

    // Force ownership to the current user, regardless of what's in the file.
    // Rows come from arbitrary JSON, so they're intentionally loosely typed.
    const withUser = (rows: unknown): any[] =>
      (Array.isArray(rows) ? rows : []).map((r) => ({ ...(r as object), userId }));
    const plain = (rows: unknown): any[] => (Array.isArray(rows) ? rows : []);

    // Wipe existing data (FK-safe order); splits/attachments cascade with transactions.
    await prisma.transaction.deleteMany({ where: { userId } });
    await prisma.transfer.deleteMany({ where: { userId } });
    await prisma.accountValuation.deleteMany({ where: { userId } });
    await prisma.recurringTransaction.deleteMany({ where: { userId } });
    await prisma.recurringTransfer.deleteMany({ where: { userId } });
    await prisma.exchangeRate.deleteMany({ where: { userId } });
    await prisma.budget.deleteMany({ where: { userId } });
    await prisma.goal.deleteMany({ where: { userId } });
    await prisma.categoryRule.deleteMany({ where: { userId } });
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });
    await prisma.liability.deleteMany({ where: { userId } });
    await prisma.asset.deleteMany({ where: { userId } });

    // Recreate (referenced rows before referrers).
    await prisma.account.createMany({ data: withUser(data.accounts) });
    await prisma.category.createMany({ data: withUser(data.categories) });
    await prisma.categoryRule.createMany({ data: withUser(data.categoryRules ?? []) });
    await prisma.recurringTransaction.createMany({ data: withUser(data.recurring) });
    await prisma.recurringTransfer.createMany({ data: withUser(data.recurringTransfers) });
    await prisma.transaction.createMany({ data: withUser(data.transactions) });
    await prisma.transactionSplit.createMany({ data: plain(data.splits) });
    await prisma.transfer.createMany({ data: withUser(data.transfers) });
    await prisma.budget.createMany({ data: withUser(data.budgets) });
    await prisma.goal.createMany({ data: withUser(data.goals) });
    await prisma.accountValuation.createMany({ data: withUser(data.valuations) });
    await prisma.exchangeRate.createMany({ data: withUser(data.rates) });
    await prisma.liability.createMany({ data: withUser(data.liabilities ?? []) });
    await prisma.asset.createMany({ data: withUser(data.assets ?? []) });
    if (data.settings?.currency) {
      await prisma.settings.upsert({
        where: { userId },
        update: { currency: data.settings.currency },
        create: { userId, currency: data.settings.currency },
      });
    }

    // Fitness data — only replaced when the backup has it, so restoring a
    // backup made before fitness tracking existed doesn't wipe your workouts.
    if (Array.isArray(data.workouts)) {
      await prisma.workout.deleteMany({ where: { userId } }); // sets cascade
      const workouts = withUser(data.workouts);
      await prisma.workout.createMany({ data: workouts });
      // Only attach sets to workouts that were just restored for this user.
      const ids = new Set(workouts.map((w) => w.id));
      await prisma.workoutSet.createMany({
        data: plain(data.workoutSets).filter((s) => ids.has(s?.workoutId)),
      });
    }
    if (Array.isArray(data.workoutPresets)) {
      await prisma.workoutPreset.deleteMany({ where: { userId } });
      await prisma.workoutPreset.createMany({ data: withUser(data.workoutPresets) });
    }
    if (Array.isArray(data.bodyWeights)) {
      await prisma.bodyWeight.deleteMany({ where: { userId } });
      await prisma.bodyWeight.createMany({ data: withUser(data.bodyWeights) });
    }
    if (Array.isArray(data.fitnessGoals)) {
      await prisma.fitnessGoal.deleteMany({ where: { userId } });
      await prisma.fitnessGoal.createMany({ data: withUser(data.fitnessGoals) });
    }
    if (typeof data.settings?.weeklyWorkoutGoal === "number") {
      await prisma.settings.upsert({
        where: { userId },
        update: { weeklyWorkoutGoal: data.settings.weeklyWorkoutGoal },
        create: { userId, weeklyWorkoutGoal: data.settings.weeklyWorkoutGoal },
      });
    }

    res.json({
      restored: true,
      counts: {
        accounts: data.accounts?.length ?? 0,
        transactions: data.transactions?.length ?? 0,
        transfers: data.transfers?.length ?? 0,
        workouts: data.workouts?.length ?? 0,
      },
    });
  })
);
