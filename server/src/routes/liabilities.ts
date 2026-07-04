import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { serialize, serializeMany } from "../lib/serialize.js";

export const liabilitiesRouter = Router();

const liabilityInput = z.object({
  name: z.string().min(1),
  type: z.string().min(1), // loan | mortgage | lease | credit | other
  currency: z.string().min(1).default("GBP"),
  balance: z.number().finite().min(0).default(0),
  interestRate: z.number().finite().min(0).max(999).default(0),
  monthlyPayment: z.number().finite().min(0).default(0),
  note: z.string().nullable().optional(),
});

liabilitiesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const liabilities = await prisma.liability.findMany({
      where: { userId: getUserId(req) },
      orderBy: { createdAt: "asc" },
    });
    res.json(serializeMany(liabilities));
  })
);

liabilitiesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = liabilityInput.parse(req.body);
    const liability = await prisma.liability.create({ data: { ...data, userId: getUserId(req) } });
    res.status(201).json(serialize(liability));
  })
);

liabilitiesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = liabilityInput.partial().parse(req.body);
    const result = await prisma.liability.updateMany({
      where: { id: req.params.id, userId: getUserId(req) },
      data,
    });
    if (result.count === 0) throw new HttpError(404, "Liability not found");
    const liability = await prisma.liability.findUnique({ where: { id: req.params.id } });
    res.json(serialize(liability!));
  })
);

liabilitiesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await prisma.liability.deleteMany({
      where: { id: req.params.id, userId: getUserId(req) },
    });
    if (result.count === 0) throw new HttpError(404, "Liability not found");
    res.status(204).end();
  })
);
