import { prisma } from "./prisma.js";
import { toNumber } from "./serialize.js";

export interface Conversion {
  base: string;
  /** Value of 1 unit of `currency` in the base currency. Unknown ⇒ 1. */
  rateOf: (currency: string) => number;
  /** Convert an amount in `currency` to the base currency. */
  toBase: (amount: number, currency: string) => number;
}

/** Build a currency converter for a user from their settings + exchange rates. */
export async function getConversion(userId: string): Promise<Conversion> {
  const [settings, rates] = await Promise.all([
    prisma.settings.findUnique({ where: { userId } }),
    prisma.exchangeRate.findMany({ where: { userId } }),
  ]);
  const base = settings?.currency ?? "GBP";
  const map = new Map<string, number>();
  for (const r of rates) map.set(r.currency, toNumber(r.rate));
  map.set(base, 1);

  const rateOf = (currency: string) => map.get(currency) ?? 1;
  return {
    base,
    rateOf,
    toBase: (amount, currency) => amount * rateOf(currency),
  };
}
