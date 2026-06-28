import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, serializeMany } from "../lib/serialize.js";

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

valuationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const data = valuationInput.parse(req.body);
    const owned = await prisma.account.findFirst({ where: { id: data.accountId, userId } });
    if (!owned) throw new HttpError(400, "Account not found");
    const valuation = await prisma.accountValuation.create({ data: { ...data, userId } });
    res.status(201).json(serialize(valuation));
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
