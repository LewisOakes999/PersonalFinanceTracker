import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, serializeMany } from "../lib/serialize.js";
import { materializeDue } from "../lib/recurring.js";

export const recurringTransfersRouter = Router();

const input = z
  .object({
    amount: z.number().finite().positive(),
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    note: z.string().nullable().optional(),
    frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "yearly"]),
    nextDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => d.fromAccountId !== d.toAccountId, {
    message: "From and to accounts must be different",
    path: ["toAccountId"],
  });

async function assertAccounts(userId: string, fromId: string, toId: string) {
  const count = await prisma.account.count({ where: { userId, id: { in: [fromId, toId] } } });
  if (count < 2) throw new HttpError(400, "Both accounts must belong to you.");
}

const include = { fromAccount: true, toAccount: true } as const;

recurringTransfersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await materializeDue(userId);
    const rules = await prisma.recurringTransfer.findMany({
      where: { userId },
      orderBy: { nextDate: "asc" },
      include,
    });
    res.json(serializeMany(rules));
  })
);

recurringTransfersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = input.parse(req.body);
    await assertAccounts(userId, data.fromAccountId, data.toAccountId);
    const rule = await prisma.recurringTransfer.create({ data: { ...data, userId }, include });
    await materializeDue(userId);
    const fresh = await prisma.recurringTransfer.findUnique({ where: { id: rule.id }, include });
    res.status(201).json(serialize(fresh!));
  })
);

recurringTransfersRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = input.parse(req.body);
    const existing = await prisma.recurringTransfer.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new HttpError(404, "Recurring transfer not found");
    await assertAccounts(userId, data.fromAccountId, data.toAccountId);
    const rule = await prisma.recurringTransfer.update({ where: { id: req.params.id }, data, include });
    res.json(serialize(rule));
  })
);

recurringTransfersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.recurringTransfer.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Recurring transfer not found");
    res.status(204).end();
  })
);
