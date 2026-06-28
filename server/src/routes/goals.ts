import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { toNumber } from "../lib/serialize.js";
import { accountBalances } from "../lib/balances.js";
import { getConversion, type Conversion } from "../lib/currency.js";

export const goalsRouter = Router();

const goalInput = z.object({
  name: z.string().min(1),
  targetAmount: z.number().finite().positive(),
  savedAmount: z.number().finite().min(0).default(0),
  targetDate: z.coerce.date().nullable().optional(),
  accountId: z.string().nullable().optional(),
});

async function assertAccount(userId: string, accountId: string | null | undefined) {
  if (!accountId) return;
  const owned = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!owned) throw new HttpError(400, "Account not found");
}

// Shape a goal with its computed "saved" amount (account balance if linked).
function shape(
  goal: {
    id: string;
    name: string;
    targetAmount: unknown;
    savedAmount: unknown;
    targetDate: Date | null;
    accountId: string | null;
    account: { name: string; currency?: string } | null;
  },
  balances: Map<string, number>,
  conv: Conversion
) {
  const target = toNumber(goal.targetAmount as never);
  const saved =
    goal.accountId != null
      ? Math.max(
          conv.toBase(balances.get(goal.accountId) ?? 0, goal.account?.currency ?? conv.base),
          0
        )
      : toNumber(goal.savedAmount as never);
  return {
    id: goal.id,
    name: goal.name,
    targetAmount: target,
    savedAmount: toNumber(goal.savedAmount as never),
    targetDate: goal.targetDate,
    accountId: goal.accountId,
    accountName: goal.account?.name ?? null,
    saved,
    remaining: Math.max(target - saved, 0),
    progress: target > 0 ? saved / target : 0,
  };
}

goalsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const [goals, balances, conv] = await Promise.all([
      prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, include: { account: true } }),
      accountBalances(userId),
      getConversion(userId),
    ]);
    res.json(goals.map((g) => shape(g, balances, conv)));
  })
);

goalsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = goalInput.parse(req.body);
    await assertAccount(userId, data.accountId);
    const goal = await prisma.goal.create({
      data: { ...data, accountId: data.accountId ?? null, userId },
      include: { account: true },
    });
    const [balances, conv] = await Promise.all([accountBalances(userId), getConversion(userId)]);
    res.status(201).json(shape(goal, balances, conv));
  })
);

goalsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = goalInput.parse(req.body);
    await assertAccount(userId, data.accountId);
    const result = await prisma.goal.updateMany({
      where: { id: req.params.id, userId },
      data: { ...data, accountId: data.accountId ?? null },
    });
    if (result.count === 0) throw new HttpError(404, "Goal not found");
    const goal = await prisma.goal.findUnique({
      where: { id: req.params.id },
      include: { account: true },
    });
    const [balances, conv] = await Promise.all([accountBalances(userId), getConversion(userId)]);
    res.json(shape(goal!, balances, conv));
  })
);

goalsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.goal.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Goal not found");
    res.status(204).end();
  })
);
