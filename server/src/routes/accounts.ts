import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, serializeMany } from "../lib/serialize.js";
import { materializeDue } from "../lib/recurring.js";
import { afterCloseBound, formatCloseDate } from "../lib/accountClose.js";

export const accountsRouter = Router();

const accountInput = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  currency: z.string().min(1).default("GBP"),
  openingBalance: z.number().finite().default(0),
  isIsa: z.boolean().default(false),
  isPremiumBonds: z.boolean().default(false),
  isInvestment: z.boolean().default(false),
  isPension: z.boolean().default(false),
  interestRate: z.number().finite().min(-100).max(999).default(0),
  volatility: z.number().finite().min(0).max(999).default(0),
  termStart: z.coerce.date().nullable().optional(),
  maturityDate: z.coerce.date().nullable().optional(),
  interestPaid: z.enum(["monthly", "quarterly", "annually", "maturity"]).nullable().optional(),
});

// Closing (or reopening, with null) is an edit to an existing account.
const accountUpdate = accountInput.partial().extend({
  closedAt: z.coerce.date().nullable().optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** A close date must be real (not ahead of today) and leave nothing dated after it. */
async function assertCanClose(userId: string, accountId: string, closedAt: Date) {
  // A day's grace so "today" in a timezone ahead of UTC isn't treated as the future.
  if (closedAt.getTime() > Date.now() + DAY_MS) {
    throw new HttpError(400, "The inactive date can't be in the future.");
  }
  const after = { gte: afterCloseBound(closedAt) };
  const [txns, transfers] = await Promise.all([
    prisma.transaction.count({ where: { userId, accountId, date: after } }),
    prisma.transfer.count({
      where: { userId, date: after, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }] },
    }),
  ]);
  if (txns + transfers > 0) {
    const parts = [
      txns > 0 && `${txns} transaction${txns === 1 ? "" : "s"}`,
      transfers > 0 && `${transfers} transfer${transfers === 1 ? "" : "s"}`,
    ].filter(Boolean);
    throw new HttpError(
      409,
      `${parts.join(" and ")} ${txns + transfers === 1 ? "is" : "are"} dated after ${formatCloseDate(closedAt)}. Move or delete ${txns + transfers === 1 ? "it" : "them"}, or pick a later inactive date.`
    );
  }
}

/**
 * On close: post anything that fell due while the account was still open (the
 * poster itself stops at the close date), then pause every rule still aimed at
 * the account so nothing is scheduled against it. Reopening leaves them paused.
 */
async function stopRecurringFor(userId: string, accountId: string) {
  await materializeDue(userId);
  await Promise.all([
    prisma.recurringTransaction.updateMany({
      where: { userId, accountId, active: true },
      data: { active: false },
    }),
    prisma.recurringTransfer.updateMany({
      where: {
        userId,
        active: true,
        OR: [{ fromAccountId: accountId }, { toAccountId: accountId }],
      },
      data: { active: false },
    }),
  ]);
}

accountsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const accounts = await prisma.account.findMany({
      where: { userId: getUserId(req) },
      orderBy: { createdAt: "asc" },
    });
    res.json(serializeMany(accounts));
  })
);

accountsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = accountInput.parse(req.body);
    const account = await prisma.account.create({ data: { ...data, userId: getUserId(req) } });
    res.status(201).json(serialize(account));
  })
);

accountsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = accountUpdate.parse(req.body);
    const existing = await prisma.account.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new HttpError(404, "Account not found");

    if (data.closedAt) await assertCanClose(userId, existing.id, data.closedAt);
    const account = await prisma.account.update({ where: { id: existing.id }, data });
    if (data.closedAt) await stopRecurringFor(userId, existing.id);

    res.json(serialize(account));
  })
);

accountsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const account = await prisma.account.findFirst({ where: { id: req.params.id, userId } });
    if (!account) throw new HttpError(404, "Account not found");

    const count = await prisma.transaction.count({ where: { accountId: req.params.id, userId } });
    if (count > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${count} transaction(s) use this account. Reassign them first.`
      );
    }
    const transferCount = await prisma.transfer.count({
      where: { userId, OR: [{ fromAccountId: req.params.id }, { toAccountId: req.params.id }] },
    });
    if (transferCount > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${transferCount} transfer(s) involve this account. Remove them first.`
      );
    }
    const recurringCount = await prisma.recurringTransaction.count({
      where: { userId, accountId: req.params.id },
    });
    if (recurringCount > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${recurringCount} recurring rule(s) use this account. Remove them first.`
      );
    }
    await prisma.account.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
