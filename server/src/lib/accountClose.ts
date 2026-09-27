import { HttpError } from "./http.js";

// An account's `closedAt` is the last day anything can be dated on it. Dates are
// compared by UTC calendar day, so activity on the closing day itself (e.g. the
// final withdrawal) is still allowed whatever time it carries.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Start of the UTC day after `d` — the first instant that counts as "after" it. */
function nextUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + DAY_MS;
}

/** True when `date` falls on a later day than the account's close date. */
export function isAfterClose(date: Date, closedAt: Date | null | undefined): boolean {
  return closedAt != null && date.getTime() >= nextUtcDay(closedAt);
}

/** First instant after the close day — for "dated after close" database queries. */
export function afterCloseBound(closedAt: Date): Date {
  return new Date(nextUtcDay(closedAt));
}

export function formatCloseDate(closedAt: Date): string {
  return closedAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Reject a transaction or transfer dated after the account was closed. */
export function assertOpenOn(
  account: { name: string; closedAt: Date | null },
  date: Date
): void {
  if (isAfterClose(date, account.closedAt)) {
    throw new HttpError(
      400,
      `“${account.name}” went inactive on ${formatCloseDate(account.closedAt!)}, so nothing can be dated after that.`
    );
  }
}
