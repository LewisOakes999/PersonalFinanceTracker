import type { TxnType } from "@prisma/client";
import { prisma } from "./prisma.js";

/** Default category set (cool "Liquid Glass" palette) given to every new user. */
export const DEFAULT_CATEGORIES: {
  name: string;
  type: TxnType;
  color: string;
  taxTag?: "interest" | "dividend" | "giftAid";
}[] = [
  { name: "Salary", type: "income", color: "#30d5c8" },
  { name: "Freelance", type: "income", color: "#5e9bff" },
  { name: "Interest", type: "income", color: "#64d2ff", taxTag: "interest" },
  { name: "Dividends", type: "income", color: "#22d3ee", taxTag: "dividend" },
  { name: "Rent", type: "expense", color: "#0a84ff" },
  { name: "Groceries", type: "expense", color: "#34e0c4" },
  { name: "Utilities", type: "expense", color: "#bf5af2" },
  { name: "Dining Out", type: "expense", color: "#5e5ce6" },
  { name: "Transport", type: "expense", color: "#30b0ff" },
  { name: "Entertainment", type: "expense", color: "#7d7aff" },
  { name: "Shopping", type: "expense", color: "#c77dff" },
  { name: "Health", type: "expense", color: "#64d2ff" },
  { name: "Charity", type: "expense", color: "#f472b6", taxTag: "giftAid" },
];

/**
 * Give a brand-new user a usable starting point: a default settings row, one
 * current account, and the default categories — but no transactions or budgets.
 */
export async function provisionUserDefaults(userId: string) {
  await prisma.settings.create({ data: { userId, currency: "GBP" } });
  await prisma.account.create({
    data: { userId, name: "Current Account", type: "current", currency: "GBP", openingBalance: 0 },
  });
  await prisma.category.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })),
  });
}
