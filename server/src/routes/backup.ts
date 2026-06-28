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
      settings,
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
      prisma.settings.findUnique({ where: { userId } }),
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
      settings,
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
    await prisma.category.deleteMany({ where: { userId } });
    await prisma.account.deleteMany({ where: { userId } });

    // Recreate (referenced rows before referrers).
    await prisma.account.createMany({ data: withUser(data.accounts) });
    await prisma.category.createMany({ data: withUser(data.categories) });
    await prisma.recurringTransaction.createMany({ data: withUser(data.recurring) });
    await prisma.recurringTransfer.createMany({ data: withUser(data.recurringTransfers) });
    await prisma.transaction.createMany({ data: withUser(data.transactions) });
    await prisma.transactionSplit.createMany({ data: plain(data.splits) });
    await prisma.transfer.createMany({ data: withUser(data.transfers) });
    await prisma.budget.createMany({ data: withUser(data.budgets) });
    await prisma.goal.createMany({ data: withUser(data.goals) });
    await prisma.accountValuation.createMany({ data: withUser(data.valuations) });
    await prisma.exchangeRate.createMany({ data: withUser(data.rates) });
    if (data.settings?.currency) {
      await prisma.settings.upsert({
        where: { userId },
        update: { currency: data.settings.currency },
        create: { userId, currency: data.settings.currency },
      });
    }

    res.json({
      restored: true,
      counts: {
        accounts: data.accounts?.length ?? 0,
        transactions: data.transactions?.length ?? 0,
        transfers: data.transfers?.length ?? 0,
      },
    });
  })
);
