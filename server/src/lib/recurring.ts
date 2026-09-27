import { prisma } from "./prisma.js";
import { advance } from "./recurfreq.js";
import { isAfterClose } from "./accountClose.js";

export { advance };

/**
 * Post every due occurrence for the user's active recurring rules up to `now`,
 * creating real Transaction rows and advancing each rule's nextDate. Idempotent:
 * only creates occurrences whose nextDate has actually arrived.
 */
export async function materializeDue(userId: string, now = new Date()): Promise<number> {
  const due = await prisma.recurringTransaction.findMany({
    where: { userId, active: true, nextDate: { lte: now } },
    include: { account: { select: { closedAt: true } } },
  });

  let created = 0;
  for (const r of due) {
    let next = r.nextDate;
    const toCreate: {
      userId: string;
      date: Date;
      amount: typeof r.amount;
      type: typeof r.type;
      description: string;
      note: string | null;
      categoryId: string;
      accountId: string;
      recurringId: string;
    }[] = [];

    // A closed account ends the rule: nothing posts after its close date.
    const closedAt = r.account.closedAt;
    while (next <= now && (!r.endDate || next <= r.endDate) && !isAfterClose(next, closedAt)) {
      toCreate.push({
        userId,
        date: new Date(next),
        amount: r.amount,
        type: r.type,
        description: r.description,
        note: r.note,
        categoryId: r.categoryId,
        accountId: r.accountId,
        recurringId: r.id,
      });
      next = advance(next, r.frequency);
    }

    if (toCreate.length > 0) {
      await prisma.transaction.createMany({ data: toCreate });
      created += toCreate.length;
    }

    const stillActive = !(r.endDate && next > r.endDate) && !isAfterClose(next, closedAt);
    await prisma.recurringTransaction.update({
      where: { id: r.id },
      data: { nextDate: next, active: stillActive },
    });
  }

  // Recurring transfers → real Transfer rows.
  const dueTransfers = await prisma.recurringTransfer.findMany({
    where: { userId, active: true, nextDate: { lte: now } },
    include: {
      fromAccount: { select: { closedAt: true } },
      toAccount: { select: { closedAt: true } },
    },
  });
  for (const r of dueTransfers) {
    let next = r.nextDate;
    const toCreate: {
      userId: string;
      date: Date;
      amount: typeof r.amount;
      fromAccountId: string;
      toAccountId: string;
      note: string | null;
    }[] = [];

    // Either end being closed stops the transfer from its close date on.
    const closed = (d: Date) =>
      isAfterClose(d, r.fromAccount.closedAt) || isAfterClose(d, r.toAccount.closedAt);
    while (next <= now && (!r.endDate || next <= r.endDate) && !closed(next)) {
      toCreate.push({
        userId,
        date: new Date(next),
        amount: r.amount,
        fromAccountId: r.fromAccountId,
        toAccountId: r.toAccountId,
        note: r.note,
      });
      next = advance(next, r.frequency);
    }

    if (toCreate.length > 0) {
      await prisma.transfer.createMany({ data: toCreate });
      created += toCreate.length;
    }

    const stillActive = !(r.endDate && next > r.endDate) && !closed(next);
    await prisma.recurringTransfer.update({
      where: { id: r.id },
      data: { nextDate: next, active: stillActive },
    });
  }

  return created;
}
