import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, toNumber } from "../lib/serialize.js";

export const budgetsRouter = Router();

const budgetInput = z.object({
  categoryId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
  amount: z.number().finite(),
});

// GET /api/budgets?month=YYYY-MM — returns budgets for a month with spent totals.
budgetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const month = typeof req.query.month === "string" ? req.query.month : undefined;

    const budgets = await prisma.budget.findMany({
      where: { userId, ...(month ? { month } : {}) },
      include: { category: true },
      orderBy: { category: { name: "asc" } },
    });

    // Compute spend per category for each budget's month.
    const withSpend = await Promise.all(
      budgets.map(async (budget) => {
        const start = new Date(`${budget.month}-01T00:00:00.000Z`);
        const end = new Date(start);
        end.setUTCMonth(end.getUTCMonth() + 1);
        const agg = await prisma.transaction.aggregate({
          _sum: { amount: true },
          where: {
            userId,
            categoryId: budget.categoryId,
            type: "expense",
            date: { gte: start, lt: end },
          },
        });
        return { ...serialize(budget), spent: toNumber(agg._sum.amount) };
      })
    );

    res.json(withSpend);
  })
);

// Upsert a budget for a category+month.
budgetsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = budgetInput.parse(req.body);

    const category = await prisma.category.findFirst({
      where: { id: data.categoryId, userId },
    });
    if (!category) throw new HttpError(400, "Category not found");

    const budget = await prisma.budget.upsert({
      where: { categoryId_month: { categoryId: data.categoryId, month: data.month } },
      update: { amount: data.amount },
      create: { ...data, userId },
      include: { category: true },
    });
    res.status(201).json(serialize(budget));
  })
);

budgetsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = budgetInput.partial().parse(req.body);
    const result = await prisma.budget.updateMany({
      where: { id: req.params.id, userId: getUserId(req) },
      data,
    });
    if (result.count === 0) throw new HttpError(404, "Budget not found");
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: { category: true },
    });
    res.json(serialize(budget!));
  })
);

budgetsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.budget.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Budget not found");
    res.status(204).end();
  })
);
