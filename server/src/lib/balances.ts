import { prisma } from "./prisma.js";
import { toNumber } from "./serialize.js";

/**
 * Balance per account as of `asOf` (default now), valuation-aware.
 *
 * If an account has a valuation dated on/before `asOf`, the most recent one is
 * used as the anchor and only activity *after* its date is applied. Otherwise
 * the opening balance plus all activity up to `asOf` is used.
 *
 * Activity = transactions (income +, expense −) and transfers (− from, + to).
 */
export async function accountBalances(
  userId: string,
  asOf: Date = new Date()
): Promise<Map<string, number>> {
  const [accounts, valuations, txnFlow, transfers] = await Promise.all([
    prisma.account.findMany({ where: { userId }, select: { id: true, openingBalance: true } }),
    prisma.accountValuation.findMany({
      where: { userId, date: { lte: asOf } },
      orderBy: { date: "asc" },
      select: { accountId: true, date: true, value: true },
    }),
    prisma.transaction.findMany({
      where: { userId, date: { lte: asOf } },
      select: { accountId: true, type: true, amount: true, date: true },
    }),
    prisma.transfer.findMany({
      where: { userId, date: { lte: asOf } },
      select: { fromAccountId: true, toAccountId: true, amount: true, date: true },
    }),
  ]);

  // Latest valuation per account (ascending order means the last write wins).
  const anchor = new Map<string, { date: Date; value: number }>();
  for (const v of valuations) anchor.set(v.accountId, { date: v.date, value: toNumber(v.value) });

  const map = new Map<string, number>();
  for (const a of accounts) {
    const an = anchor.get(a.id);
    map.set(a.id, an ? an.value : toNumber(a.openingBalance));
  }

  // A flow counts only if it happened strictly after the account's anchor date.
  const afterAnchor = (accountId: string, date: Date) => {
    const an = anchor.get(accountId);
    return !an || date > an.date;
  };

  for (const t of txnFlow) {
    if (!afterAnchor(t.accountId, t.date)) continue;
    const delta = t.type === "income" ? toNumber(t.amount) : -toNumber(t.amount);
    map.set(t.accountId, (map.get(t.accountId) ?? 0) + delta);
  }
  for (const tr of transfers) {
    const amt = toNumber(tr.amount);
    if (afterAnchor(tr.fromAccountId, tr.date))
      map.set(tr.fromAccountId, (map.get(tr.fromAccountId) ?? 0) - amt);
    if (afterAnchor(tr.toAccountId, tr.date))
      map.set(tr.toAccountId, (map.get(tr.toAccountId) ?? 0) + amt);
  }
  return map;
}
