// A flexible reporting period: month, calendar year, UK tax year, custom range
// or all-time. `start` is inclusive, `end` is exclusive (both YYYY-MM-DD).

export type PeriodMode = "month" | "year" | "taxYear" | "custom" | "all";

export interface Period {
  mode: PeriodMode;
  year: number; // anchor year (month / year / taxYear)
  month: number; // 1-12 (month mode)
  from: string; // YYYY-MM-DD (custom)
  to: string; // YYYY-MM-DD (custom, inclusive)
  start?: string; // computed inclusive bound
  end?: string; // computed exclusive bound
  label: string; // human label for headers
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => d.toISOString().slice(0, 10);

function fmtDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Compute start/end/label from a period's mode and anchors. */
export function buildPeriod(p: Omit<Period, "start" | "end" | "label">): Period {
  switch (p.mode) {
    case "month": {
      const start = `${p.year}-${pad(p.month)}-01`;
      const end = iso(new Date(Date.UTC(p.year, p.month, 1))); // first of next month
      const label = new Date(Date.UTC(p.year, p.month - 1, 1)).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      });
      return { ...p, start, end, label };
    }
    case "year": {
      return {
        ...p,
        start: `${p.year}-01-01`,
        end: `${p.year + 1}-01-01`,
        label: `${p.year}`,
      };
    }
    case "taxYear": {
      return {
        ...p,
        start: `${p.year}-04-06`,
        end: `${p.year + 1}-04-06`,
        label: `${p.year}/${pad((p.year + 1) % 100)} tax year`,
      };
    }
    case "custom": {
      const endExclusive = new Date(`${p.to}T00:00:00.000Z`);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      return {
        ...p,
        start: p.from,
        end: iso(endExclusive),
        label: `${fmtDate(p.from)} – ${fmtDate(p.to)}`,
      };
    }
    case "all":
    default:
      return { ...p, start: undefined, end: undefined, label: "All time" };
  }
}

/** Default period anchored on the current month. */
export function defaultPeriod(mode: PeriodMode = "month"): Period {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const firstOfMonth = `${y}-${pad(m)}-01`;
  return buildPeriod({
    mode,
    year: y,
    month: m,
    from: firstOfMonth,
    to: iso(now),
  });
}

/** Query params for the API (start/end omitted for all-time). */
export function periodParams(p: Period): Record<string, string> {
  return p.start && p.end ? { start: p.start, end: p.end } : {};
}

/** The UK tax year (starting year) that contains today. */
export function currentTaxYear(): number {
  const now = new Date();
  const aprThisYear = Date.UTC(now.getUTCFullYear(), 3, 6);
  return now.getTime() >= aprThisYear ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}
