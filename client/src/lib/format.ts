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
