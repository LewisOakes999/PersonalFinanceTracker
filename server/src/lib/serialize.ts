import { Prisma } from "@prisma/client";

/**
 * Prisma returns Decimal columns as Decimal objects which JSON-encode to
 * strings. The client works with plain numbers, so convert any Decimal we
 * send over the wire. Dates are left as ISO strings (Express default).
 */
export function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : value.toNumber();
}

type WithDecimals = Record<string, unknown>;

const DECIMAL_FIELDS = [
  "amount",
  "openingBalance",
  "interestRate",
  "volatility",
  "targetAmount",
  "savedAmount",
  "value",
  "balance",
  "monthlyPayment",
];

/** Shallow-convert known Decimal fields on a record to numbers. */
export function serialize<T extends WithDecimals>(record: T): T {
  const out: WithDecimals = { ...record };
  for (const field of DECIMAL_FIELDS) {
    if (field in out && out[field] !== null && out[field] !== undefined) {
      out[field] = toNumber(out[field] as Prisma.Decimal);
    }
  }
  return out as T;
}

export function serializeMany<T extends WithDecimals>(records: T[]): T[] {
  return records.map(serialize);
}
