import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { toNumber } from "../lib/serialize.js";

export const exportRouter = Router();

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// GET /api/export/transactions.csv — download all transactions as CSV.
exportRouter.get(
  "/transactions.csv",
  asyncHandler(async (req, res) => {
    const txns = await prisma.transaction.findMany({
      where: { userId: getUserId(req) },
      orderBy: { date: "desc" },
      include: { category: true, account: true },
    });

    const header = ["date", "amount", "type", "category", "account", "description", "note"];
    const lines = [header.join(",")];
    for (const t of txns) {
      lines.push(
        [
          t.date.toISOString().slice(0, 10),
          toNumber(t.amount).toFixed(2),
          t.type,
          t.category.name,
          t.account.name,
          t.description,
          t.note ?? "",
        ]
          .map((v) => csvCell(String(v)))
          .join(",")
      );
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="transactions.csv"');
    res.send(lines.join("\n"));
  })
);
