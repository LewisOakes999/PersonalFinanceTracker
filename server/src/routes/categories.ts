import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";

export const categoriesRouter = Router();

const categoryInput = z.object({
  name: z.string().min(1),
  type: z.enum(["income", "expense"]),
  color: z.string().min(1).default("#38bdf8"),
  taxTag: z.enum(["interest", "dividend", "giftAid"]).nullable().optional(),
});

categoriesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
      where: { userId: getUserId(req) },
      orderBy: { name: "asc" },
    });
    res.json(categories);
  })
);

categoriesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = categoryInput.parse(req.body);
    const category = await prisma.category.create({ data: { ...data, userId: getUserId(req) } });
    res.status(201).json(category);
  })
);

categoriesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = categoryInput.partial().parse(req.body);
    const result = await prisma.category.updateMany({
      where: { id: req.params.id, userId: getUserId(req) },
      data,
    });
    if (result.count === 0) throw new HttpError(404, "Category not found");
    const category = await prisma.category.findUnique({ where: { id: req.params.id } });
    res.json(category);
  })
);

categoriesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const category = await prisma.category.findFirst({ where: { id: req.params.id, userId } });
    if (!category) throw new HttpError(404, "Category not found");

    const count = await prisma.transaction.count({ where: { categoryId: req.params.id, userId } });
    if (count > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${count} transaction(s) use this category. Reassign them first.`
      );
    }
    const recurringCount = await prisma.recurringTransaction.count({
      where: { categoryId: req.params.id, userId },
    });
    if (recurringCount > 0) {
      throw new HttpError(
        409,
        `Cannot delete: ${recurringCount} recurring rule(s) use this category. Remove them first.`
      );
    }
    await prisma.budget.deleteMany({ where: { categoryId: req.params.id, userId } });
    await prisma.category.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);
