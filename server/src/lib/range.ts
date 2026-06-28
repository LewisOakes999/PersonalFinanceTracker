import type { Request } from "express";

export interface DateRange {
  start: Date;
  end: Date; // exclusive
}

export function monthRange(month: string): DateRange {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

/**
 * Resolve a date range from query params. Supports an explicit `start`/`end`
 * (YYYY-MM-DD, end exclusive) or a legacy `month` (YYYY-MM). Returns null when
 * nothing valid is provided so the caller can choose a default.
 */
export function resolveRange(req: Request): DateRange | null {
  const { start, end, month } = req.query;

  if (typeof start === "string" && typeof end === "string") {
    const s = new Date(`${start}T00:00:00.000Z`);
    const e = new Date(`${end}T00:00:00.000Z`);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s < e) {
      return { start: s, end: e };
    }
  }
  if (typeof month === "string" && /^\d{4}-\d{2}$/.test(month)) {
    return monthRange(month);
  }
  return null;
}
