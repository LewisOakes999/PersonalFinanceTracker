import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, serializeMany } from "../lib/serialize.js";
import { resolveRange } from "../lib/range.js";
import { assertOpenOn } from "../lib/accountClose.js";

export const transfersRouter = Router();

const transferInput = z
  .object({
    date: z.coerce.date(),
    amount: z.number().finite().positive(),
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    note: z.string().nullable().optional(),
  })
  .refine((d) => d.fromAccountId !== d.toAccountId, {
    message: "From and to accounts must be different",
    path: ["toAccountId"],
  });

/** Both accounts must be the user's and still open on the transfer's date. */
async function assertAccounts(userId: string, fromId: string, toId: string, date: Date) {
  const accounts = await prisma.account.findMany({
    where: { userId, id: { in: [fromId, toId] } },
    select: { name: true, closedAt: true },
  });
  if (accounts.length < 2) throw new HttpError(400, "Both accounts must belong to you.");
  for (const a of accounts) assertOpenOn(a, date);
}

const withAccounts = { fromAccount: true, toAccount: true } as const;

// GET /api/transfers?month=YYYY-MM&accountId=...
transfersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { accountId } = req.query;

    const where: Record<string, unknown> = { userId };
    const range = resolveRange(req);
    if (range) where.date = { gte: range.start, lt: range.end };
    if (typeof accountId === "string" && accountId) {
      where.OR = [{ fromAccountId: accountId }, { toAccountId: accountId }];
    }

    const transfers = await prisma.transfer.findMany({
      where,
      orderBy: { date: "desc" },
      include: withAccounts,
    });
    res.json(serializeMany(transfers));
  })
);

transfersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = transferInput.parse(req.body);
    await assertAccounts(userId, data.fromAccountId, data.toAccountId, data.date);
    const transfer = await prisma.transfer.create({
      data: { ...data, userId },
      include: withAccounts,
    });
    res.status(201).json(serialize(transfer));
  })
);

transfersRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = transferInput.parse(req.body);
    const existing = await prisma.transfer.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new HttpError(404, "Transfer not found");
    await assertAccounts(userId, data.fromAccountId, data.toAccountId, data.date);
    const transfer = await prisma.transfer.update({
      where: { id: req.params.id },
      data,
      include: withAccounts,
    });
    res.json(serialize(transfer));
  })
);

transfersRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.transfer.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Transfer not found");
    res.status(204).end();
  })
);
