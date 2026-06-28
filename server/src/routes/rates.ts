import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";

export const ratesRouter = Router();

const rateInput = z.object({
  currency: z.string().min(1).max(8),
  rate: z.number().finite().positive(),
});

// GET /api/rates — the user's saved exchange rates (to base currency).
ratesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const rates = await prisma.exchangeRate.findMany({
      where: { userId: getUserId(req) },
      orderBy: { currency: "asc" },
    });
    res.json(rates.map((r) => ({ id: r.id, currency: r.currency, rate: Number(r.rate) })));
  })
);

// PUT /api/rates — upsert a rate for a currency.
ratesRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { currency, rate } = rateInput.parse(req.body);
    const saved = await prisma.exchangeRate.upsert({
      where: { userId_currency: { userId, currency } },
      update: { rate },
      create: { userId, currency, rate },
    });
    res.json({ id: saved.id, currency: saved.currency, rate: Number(saved.rate) });
  })
);

ratesRouter.delete(
  "/:currency",
  asyncHandler(async (req, res) => {
    const result = await prisma.exchangeRate.deleteMany({
      where: { userId: getUserId(req), currency: req.params.currency },
    });
    if (result.count === 0) throw new HttpError(404, "Rate not found");
    res.status(204).end();
  })
);
