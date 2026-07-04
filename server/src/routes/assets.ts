import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, serializeMany } from "../lib/serialize.js";

export const assetsRouter = Router();

const assetInput = z.object({
  name: z.string().min(1),
  type: z.string().min(1), // property | vehicle | valuables | cash | other
  currency: z.string().min(1).default("GBP"),
  value: z.number().finite().default(0),
  note: z.string().nullable().optional(),
});

assetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const assets = await prisma.asset.findMany({
      where: { userId: getUserId(req) },
      orderBy: { createdAt: "asc" },
    });
    res.json(serializeMany(assets));
  })
);

assetsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = assetInput.parse(req.body);
    const asset = await prisma.asset.create({ data: { ...data, userId: getUserId(req) } });
    res.status(201).json(serialize(asset));
  })
);

assetsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = assetInput.partial().parse(req.body);
    const result = await prisma.asset.updateMany({
      where: { id: req.params.id, userId: getUserId(req) },
      data,
    });
    if (result.count === 0) throw new HttpError(404, "Asset not found");
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    res.json(serialize(asset!));
  })
);

assetsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.asset.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Asset not found");
    res.status(204).end();
  })
);
