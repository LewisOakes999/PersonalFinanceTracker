import { formatDate } from "./format";

// An account goes inactive on its `closedAt` day: it drops out of the active
// lists, and nothing can be dated after that day (the day itself is still fine).

type Closable = { id: string; name: string; closedAt?: string | null };

export const isInactive = (a: { closedAt?: string | null }) => Boolean(a.closedAt);

/** The first still-active account's id — the default for anything new. */
export function firstActiveId(accounts: Closable[], except?: string): string {
  return accounts.find((a) => !a.closedAt && a.id !== except)?.id ?? "";
}

/**
 * The server's rejection message if `date` (YYYY-MM-DD) falls after the
 * account went inactive, else null — so forms can stop before submitting.
 */
export function inactiveDateError(account: Closable | undefined, date: string): string | null {
  if (!account?.closedAt || !date) return null;
  if (date.slice(0, 10) <= account.closedAt.slice(0, 10)) return null;
  return `“${account.name}” went inactive on ${formatDate(account.closedAt)}, so nothing can be dated after that.`;
}
