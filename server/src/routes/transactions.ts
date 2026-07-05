import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, toNumber } from "../lib/serialize.js";
import { materializeDue } from "../lib/recurring.js";
import { resolveRange } from "../lib/range.js";

export const transactionsRouter = Router();

const transactionInput = z.object({
  date: z.coerce.date(),
  amount: z.number().finite(),
  type: z.enum(["income", "expense"]),
  categoryId: z.string().min(1),
  accountId: z.string().min(1),
  description: z.string().default(""),
  note: z.string().nullable().optional(),
  tags: z.array(z.string().min(1).max(24)).max(30).optional(),
  splits: z
    .array(z.object({ categoryId: z.string().min(1), amount: z.number().finite().positive() }))
    .optional(),
});

type TxnInput = z.infer<typeof transactionInput>;

const include = { category: true, account: true, splits: { include: { category: true } } } as const;

/** Serialize a transaction including its split line items (amounts → numbers). */
function shapeTxn(t: { splits?: { id: string; categoryId: string; category: unknown; amount: unknown }[] } & Record<string, unknown>) {
  const base = serialize(t);
  const splits = (t.splits ?? []).map((s) => ({
    id: s.id,
    categoryId: s.categoryId,
    category: s.category,
    amount: toNumber(s.amount as never),
  }));
  return { ...base, splits };
}

/** Ensure the referenced category and account (and any split categories) belong to the user. */
async function assertOwnership(userId: string, data: TxnInput) {
  const categoryIds = new Set([data.categoryId, ...(data.splits ?? []).map((s) => s.categoryId)]);
  const [categoryCount, account] = await Promise.all([
    prisma.category.count({ where: { userId, id: { in: [...categoryIds] } } }),
    prisma.account.findFirst({ where: { id: data.accountId, userId } }),
  ]);
  if (categoryCount < categoryIds.size) throw new HttpError(400, "Category not found");
  if (!account) throw new HttpError(400, "Account not found");

  if (data.splits && data.splits.length > 0) {
    const sum = data.splits.reduce((s, x) => s + x.amount, 0);
    if (Math.abs(sum - data.amount) > 0.01) {
      throw new HttpError(400, "Split amounts must add up to the transaction total.");
    }
  }
}

// GET /api/transactions  — supports filtering, search and sorting.
transactionsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    await materializeDue(userId); // post any recurring items now due
    const { type, categoryId, accountId, search, sort, order } = req.query;

    const where: Record<string, unknown> = { userId };
    if (type === "income" || type === "expense") where.type = type;
    if (typeof categoryId === "string" && categoryId) where.categoryId = categoryId;
    if (typeof accountId === "string" && accountId) where.accountId = accountId;
    const range = resolveRange(req); // start/end or legacy month; null = all time
    if (range) where.date = { gte: range.start, lt: range.end };
    if (typeof search === "string" && search.trim()) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { note: { contains: search, mode: "insensitive" } },
        { category: { name: { contains: search, mode: "insensitive" } } },
      ];
    }

    const sortField = ["date", "amount", "description"].includes(String(sort))
      ? String(sort)
      : "date";
    const sortOrder = order === "asc" ? "asc" : "desc";

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { [sortField]: sortOrder },
      include,
    });
    res.json(transactions.map((t) => shapeTxn(t as never)));
  })
);

transactionsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = transactionInput.parse(req.body);
    await assertOwnership(userId, data);
    const { splits, ...fields } = data;
    const txn = await prisma.transaction.create({
      data: {
        ...fields,
        userId,
        splits: splits && splits.length > 0 ? { create: splits } : undefined,
      },
      include,
    });
    res.status(201).json(shapeTxn(txn as never));
  })
);

transactionsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = transactionInput.parse(req.body);
    const existing = await prisma.transaction.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new HttpError(404, "Transaction not found");
    await assertOwnership(userId, data);
    const { splits, ...fields } = data;

    // Replace split line items wholesale.
    await prisma.transactionSplit.deleteMany({ where: { transactionId: req.params.id } });
    const txn = await prisma.transaction.update({
      where: { id: req.params.id },
      data: {
        ...fields,
        splits: splits && splits.length > 0 ? { create: splits } : undefined,
      },
      include,
    });
    res.json(shapeTxn(txn as never));
  })
);

transactionsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.transaction.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Transaction not found");
    res.status(204).end();
  })
);
