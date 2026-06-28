import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";

export const settingsRouter = Router();

async function getOrCreateSettings(userId: string) {
  return prisma.settings.upsert({
    where: { userId },
    update: {},
    create: { userId, currency: "GBP" },
  });
}

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await getOrCreateSettings(getUserId(req)));
  })
);

settingsRouter.put(
  "/",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { currency } = z.object({ currency: z.string().min(1) }).parse(req.body);
    await getOrCreateSettings(userId);
    const settings = await prisma.settings.update({ where: { userId }, data: { currency } });
    res.json(settings);
  })
);
