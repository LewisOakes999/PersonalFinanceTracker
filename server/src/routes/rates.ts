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

// POST /api/rates/refresh — pull live mid-market rates (frankfurter.app, no API
// key) for every non-base currency the user holds, and upsert them.
ratesRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const [settings, accounts] = await Promise.all([
      prisma.settings.findUnique({ where: { userId } }),
      prisma.account.findMany({ where: { userId }, select: { currency: true } }),
    ]);
    const base = settings?.currency ?? "GBP";
    const targets = [...new Set(accounts.map((a) => a.currency))].filter((c) => c && c !== base);
    if (targets.length === 0) return res.json({ updated: 0, base });

    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(
      base
    )}&to=${targets.map(encodeURIComponent).join(",")}`;
    let data: { rates?: Record<string, number>; date?: string };
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`provider returned ${r.status}`);
      data = (await r.json()) as { rates?: Record<string, number>; date?: string };
    } catch (err) {
      throw new HttpError(502, `Couldn't fetch live rates: ${(err as Error).message}`);
    }
    const rates = data.rates ?? {};

    const updated: string[] = [];
    for (const c of targets) {
      const perBase = rates[c]; // units of c per 1 base
      if (!perBase || !Number.isFinite(perBase) || perBase <= 0) continue;
      const rate = Math.round((1 / perBase) * 1e6) / 1e6; // 1 unit of c, in base
      await prisma.exchangeRate.upsert({
        where: { userId_currency: { userId, currency: c } },
        update: { rate },
        create: { userId, currency: c, rate },
      });
      updated.push(c);
    }
    res.json({ updated: updated.length, currencies: updated, base, asOf: data.date });
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
