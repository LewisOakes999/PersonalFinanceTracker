import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { parseCsv } from "../lib/csv.js";

export const importRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const PALETTE = ["#0a84ff", "#34e0c4", "#30b0ff", "#5e5ce6", "#bf5af2", "#7d7aff", "#64d2ff"];

/**
 * POST /api/import — multipart upload with a `file` CSV field and optional
 * `accountId` field. Expected columns: date, amount, type, category, description.
 * Categories are matched case-insensitively or created on the fly.
 */
importRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    if (!req.file) throw new HttpError(400, "No CSV file uploaded (field name 'file').");

    const rows = parseCsv(req.file.buffer.toString("utf8"));
    if (rows.length === 0) throw new HttpError(400, "CSV contained no data rows.");

    // Resolve the target account (must belong to the user).
    let accountId = typeof req.body.accountId === "string" ? req.body.accountId : "";
    if (accountId) {
      const owned = await prisma.account.findFirst({ where: { id: accountId, userId } });
      if (!owned) throw new HttpError(400, "Account not found.");
    } else {
      const first = await prisma.account.findFirst({
        where: { userId },
        orderBy: { createdAt: "asc" },
      });
      if (!first) throw new HttpError(400, "No account exists to import into. Create one first.");
      accountId = first.id;
    }

    // Preload the user's categories for case-insensitive matching.
    const existing = await prisma.category.findMany({ where: { userId } });
    const categoryByName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));

    // Auto-categorisation rules: fill a category from the description when a row
    // doesn't specify one.
    const rules = await prisma.categoryRule.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { category: { select: { name: true } } },
    });

    const created: string[] = [];
    const errors: { line: number; message: string }[] = [];
    let colorIdx = existing.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 2; // +1 header, +1 to 1-index
      try {
        const rawType = (row.type || "").toLowerCase();
        const type = rawType === "income" ? "income" : "expense";
        const amount = Math.abs(Number(row.amount));
        if (!Number.isFinite(amount) || amount === 0) {
          throw new Error(`invalid amount "${row.amount}"`);
        }
        const date = new Date(row.date);
        if (Number.isNaN(date.getTime())) throw new Error(`invalid date "${row.date}"`);

        const provided = (row.category || "").trim();
        const desc = (row.description || "").toLowerCase();
        const rule = !provided && desc ? rules.find((r) => desc.includes(r.match.toLowerCase())) : undefined;
        const name = provided || rule?.category.name || "Uncategorized";
        let category = categoryByName.get(name.toLowerCase());
        if (!category) {
          category = await prisma.category.create({
            data: { name, type, color: PALETTE[colorIdx++ % PALETTE.length], userId },
          });
          categoryByName.set(name.toLowerCase(), category);
        }

        await prisma.transaction.create({
          data: {
            userId,
            date,
            amount,
            type,
            categoryId: category.id,
            accountId,
            description: row.description || "",
          },
        });
        created.push(row.description || name);
      } catch (err) {
        errors.push({ line, message: (err as Error).message });
      }
    }

    res.json({ imported: created.length, failed: errors.length, errors });
  })
);
