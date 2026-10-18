import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, serializeMany } from "../lib/serialize.js";
import { assertOpenOn } from "../lib/accountClose.js";

export const valuationsRouter = Router();

const valuationInput = z.object({
  accountId: z.string().min(1),
  date: z.coerce.date(),
  value: z.number().finite(),
  note: z.string().nullable().optional(),
});

// GET /api/valuations?accountId=... — list valuations (newest first).
valuationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    const valuations = await prisma.accountValuation.findMany({
      where: { userId, ...(accountId ? { accountId } : {}) },
      orderBy: { date: "desc" },
    });
    res.json(serializeMany(valuations));
  })
);

/** The account must be the user's, and a value can't be dated in the future or
 *  after the account went inactive. */
async function assertValuable(userId: string, accountId: string, date: Date) {
  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new HttpError(400, "Account not found");
  // A day's grace so "today" in a timezone ahead of UTC isn't treated as the future.
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    throw new HttpError(400, "A value can't be dated in the future.");
  }
  assertOpenOn(account, date);
}

valuationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = valuationInput.parse(req.body);
    await assertValuable(userId, data.accountId, data.date);
    const valuation = await prisma.accountValuation.create({ data: { ...data, userId } });
    res.status(201).json(serialize(valuation));
  })
);

valuationsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = valuationInput.parse(req.body);
    const existing = await prisma.accountValuation.findFirst({ where: { id: req.params.id, userId } });
    if (!existing) throw new HttpError(404, "Valuation not found");
    await assertValuable(userId, data.accountId, data.date);
    const valuation = await prisma.accountValuation.update({ where: { id: existing.id }, data });
    res.json(serialize(valuation));
  })
);

valuationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.accountValuation.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Valuation not found");
    res.status(204).end();
  })
);
