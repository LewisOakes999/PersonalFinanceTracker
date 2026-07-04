const SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF ",
  INR: "₹",
};

export const CURRENCIES = Object.keys(SYMBOLS);

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

/** Format a number as currency with the given code, e.g. £1,234.56. */
export function formatCurrency(value: number, code = "GBP"): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${currencySymbol(code)}${abs}`;
}

/** Current month as YYYY-MM. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Human label for a YYYY-MM month, e.g. "June 2026". */
export function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

/** Short month label, e.g. "Jun 26". */
export function shortMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "short",
    year: "2-digit",
  });
}

/** A list of the last `count` months (oldest first) as YYYY-MM, ending at current. */
export function recentMonths(count = 12): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** An <input type="date"> value (YYYY-MM-DD) from an ISO/date string, or "". */
export function toDateInput(iso?: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : "";
}

/** e.g. "1-year term", "18-month term", or null if the dates don't form a term. */
export function termLabel(startIso?: string | null, endIso?: string | null): string | null {
  if (!startIso || !endIso) return null;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.4375));
  if (months <= 0) return null;
  if (months % 12 === 0) return `${months / 12}-year term`;
  return `${months}-month term`;
}

const STEP_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, annually: 12 };

/** The next date interest is paid, given the frequency, start and maturity. */
export function nextInterestDate(a: {
  termStart?: string | null;
  maturityDate?: string | null;
  interestPaid?: string | null;
}): string | null {
  const freq = a.interestPaid;
  if (!freq) return null;
  if (freq === "maturity") return a.maturityDate ?? null;
  const step = STEP_MONTHS[freq];
  if (!step || !a.termStart) return null;
  const now = new Date();
  const d = new Date(a.termStart);
  let guard = 0;
  while (d <= now && guard < 1200) {
    d.setMonth(d.getMonth() + step);
    guard++;
  }
  if (a.maturityDate && d > new Date(a.maturityDate)) return a.maturityDate;
  return d.toISOString().slice(0, 10);
}
