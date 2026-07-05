import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";

export const categoryRulesRouter = Router();

const ruleInput = z.object({
  match: z.string().min(1),
  categoryId: z.string().min(1),
});

categoryRulesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rules = await prisma.categoryRule.findMany({
      where: { userId: getUserId(req) },
      orderBy: { createdAt: "asc" },
      include: { category: { select: { id: true, name: true, type: true, color: true } } },
    });
    res.json(rules);
  })
);

categoryRulesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = ruleInput.parse(req.body);
    const owned = await prisma.category.findFirst({ where: { id: data.categoryId, userId } });
    if (!owned) throw new HttpError(400, "Category not found.");
    const rule = await prisma.categoryRule.create({
      data: { ...data, userId },
      include: { category: { select: { id: true, name: true, type: true, color: true } } },
    });
    res.status(201).json(rule);
  })
);

categoryRulesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.categoryRule.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Rule not found");
    res.status(204).end();
  })
);

// POST /api/category-rules/apply — recategorise existing transactions by the
// rules. First matching rule (oldest first) whose category type matches wins.
// Body: { onlyUncategorized?: boolean } (default true = don't touch categorised).
categoryRulesRouter.post(
  "/apply",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const onlyUncategorized = req.body?.onlyUncategorized !== false;

    const [rules, txns] = await Promise.all([
      prisma.categoryRule.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        include: { category: { select: { id: true, type: true } } },
      }),
      prisma.transaction.findMany({
        where: { userId },
        select: {
          id: true,
          description: true,
          categoryId: true,
          type: true,
          category: { select: { name: true } },
        },
      }),
    ]);

    const updates: { id: string; categoryId: string }[] = [];
    for (const t of txns) {
      if (onlyUncategorized && t.category.name.toLowerCase() !== "uncategorized") continue;
      const desc = (t.description || "").toLowerCase();
      if (!desc) continue;
      const rule = rules.find(
        (r) => r.category.type === t.type && desc.includes(r.match.toLowerCase())
      );
      if (rule && rule.categoryId !== t.categoryId) {
        updates.push({ id: t.id, categoryId: rule.categoryId });
      }
    }

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((u) =>
          prisma.transaction.update({ where: { id: u.id }, data: { categoryId: u.categoryId } })
        )
      );
    }
    res.json({ updated: updates.length });
  })
);
