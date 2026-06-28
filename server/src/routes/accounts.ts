import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, serializeMany } from "../lib/serialize.js";

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
});

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
    const data = accountInput.partial().parse(req.body);
    const result = await prisma.account.updateMany({
      where: { id: req.params.id, userId: getUserId(req) },
      data,
    });
    if (result.count === 0) throw new HttpError(404, "Account not found");
    const account = await prisma.account.findUnique({ where: { id: req.params.id } });
    res.json(serialize(account!));
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
