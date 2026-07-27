import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, toNumber } from "../lib/serialize.js";
import { depreciatedValue, depreciationRate } from "../lib/depreciation.js";

export const assetsRouter = Router();

const assetInput = z.object({
  name: z.string().min(1),
  type: z.string().min(1), // property | vehicle | valuables | cash | other
  currency: z.string().min(1).default("GBP"),
  value: z.number().finite().default(0),
  // The user opts in to depreciation, but never picks the rate — that comes
  // from the asset type (see lib/depreciation.ts).
  depreciates: z.boolean().default(false),
  valueDate: z.coerce.date().nullable().optional(),
  note: z.string().nullable().optional(),
});

/** Attach the derived rate and today's written-down value. */
function shapeAsset(a: {
  value: unknown;
  type: string;
  depreciates: boolean;
  valueDate: Date | null;
}) {
  const base = serialize(a as never) as Record<string, unknown>;
  const value = toNumber(a.value as never);
  return {
    ...base,
    depreciationRate: depreciationRate(a.type),
    currentValue: depreciatedValue({
      value,
      type: a.type,
      depreciates: a.depreciates,
      from: a.valueDate,
    }),
  };
}

assetsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const assets = await prisma.asset.findMany({
      where: { userId: getUserId(req) },
      orderBy: { createdAt: "asc" },
    });
    res.json(assets.map(shapeAsset));
  })
);

assetsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = assetInput.parse(req.body);
    const asset = await prisma.asset.create({
      data: {
        ...data,
        // Depreciation needs a start point: the value is taken as accurate today
        // unless the user gave a date.
        valueDate: data.valueDate ?? new Date(),
        userId: getUserId(req),
      },
    });
    res.status(201).json(shapeAsset(asset));
  })
);

assetsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = assetInput.partial().parse(req.body);
    // Restating the value resets the clock, otherwise the new figure would be
    // written down again for time that has already passed.
    const patch =
      data.value !== undefined && data.valueDate === undefined
        ? { ...data, valueDate: new Date() }
        : data;
    const result = await prisma.asset.updateMany({
      where: { id: req.params.id, userId: getUserId(req) },
      data: patch,
    });
    if (result.count === 0) throw new HttpError(404, "Asset not found");
    const asset = await prisma.asset.findUnique({ where: { id: req.params.id } });
    res.json(shapeAsset(asset!));
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
