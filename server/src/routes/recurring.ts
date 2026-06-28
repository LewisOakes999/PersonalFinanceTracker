import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, serializeMany } from "../lib/serialize.js";
import { materializeDue } from "../lib/recurring.js";

export const recurringRouter = Router();

const recurringInput = z.object({
  type: z.enum(["income", "expense"]),
  amount: z.number().finite().positive(),
  categoryId: z.string().min(1),
  accountId: z.string().min(1),
  description: z.string().default(""),
  note: z.string().nullable().optional(),
  frequency: z.enum(["weekly", "fortnightly", "monthly", "quarterly", "yearly"]),
  nextDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  active: z.boolean().optional(),
});

async function assertOwnership(userId: string, categoryId: string, accountId: string) {
  const [category, account] = await Promise.all([
    prisma.category.findFirst({ where: { id: categoryId, userId } }),
    prisma.account.findFirst({ where: { id: accountId, userId } }),
  ]);
  if (!category) throw new HttpError(400, "Category not found");
  if (!account) throw new HttpError(400, "Account not found");
}

const include = { category: true, account: true } as const;

// GET /api/recurring — posts any due occurrences first, then lists the rules.
recurringRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await materializeDue(userId);
    const rules = await prisma.recurringTransaction.findMany({
      where: { userId },
      orderBy: { nextDate: "asc" },
      include,
    });
    res.json(serializeMany(rules));
  })
);

// POST /api/recurring/run — manually post any due occurrences.
recurringRouter.post(
  "/run",
  asyncHandler(async (req, res) => {
    const created = await materializeDue(getUserId(req));
    res.json({ created });
  })
);

recurringRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = recurringInput.parse(req.body);
    await assertOwnership(userId, data.categoryId, data.accountId);
    const rule = await prisma.recurringTransaction.create({
      data: { ...data, userId },
      include,
    });
    // Post immediately if the first occurrence is already due.
    await materializeDue(userId);
    const fresh = await prisma.recurringTransaction.findUnique({ where: { id: rule.id }, include });
    res.status(201).json(serialize(fresh!));
  })
);

recurringRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = recurringInput.parse(req.body);
    const existing = await prisma.recurringTransaction.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!existing) throw new HttpError(404, "Recurring rule not found");
    await assertOwnership(userId, data.categoryId, data.accountId);
    const rule = await prisma.recurringTransaction.update({
      where: { id: req.params.id },
      data,
      include,
    });
    res.json(serialize(rule));
  })
);

recurringRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.recurringTransaction.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Recurring rule not found");
    res.status(204).end();
  })
);
