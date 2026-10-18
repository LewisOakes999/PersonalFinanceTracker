import { prisma } from "./prisma.js";
import { toNumber } from "./serialize.js";
import { accountBalances } from "./balances.js";
import { getConversion } from "./currency.js";

// How investment accounts have actually done — recorded values against the
// money put in — and against what the forecast expected of that money.
//
// The forecast uses the same lognormal model as the Monte Carlo projection
// (montecarlo.ts): with annual expected return r and volatility σ, money held
// for τ years grows by a factor whose log is N(τ·ln(1+r) − σ²τ/2, σ²τ). That
// has a closed form, so each contribution's median and p10/p90 growth can be
// computed directly rather than simulated.

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const Z90 = 1.2815515655446004; // standard normal 90th percentile

/** Money in (+) or out (−) of an account on a date. */
export type Flow = { date: Date; amount: number };

export interface ForecastBand {
  p10: number;
  p50: number;
  p90: number;
}

/** Growth factor for money invested `years` ago, at z-score `z` (0 = median). */
export function growthFactor(years: number, returnPct: number, volPct: number, z: number): number {
  if (years <= 0) return 1;
  const r = returnPct / 100;
  const s = volPct / 100;
  return Math.exp(years * Math.log(1 + r) - (s * s * years) / 2 + z * s * Math.sqrt(years));
}

/**
 * What the forecast expected `flows` to be worth at `at`. Each flow is grown
 * by the same percentile of its own outcome and the results are summed. That
 * treats every contribution as riding the same market, which slightly widens
 * the p10–p90 range compared with simulating it — erring towards "within
 * range" rather than raising false alarms.
 */
export function forecastAt(flows: Flow[], at: Date, returnPct: number, volPct: number): ForecastBand {
  let p10 = 0;
  let p50 = 0;
  let p90 = 0;
  for (const f of flows) {
    if (f.date > at) continue;
    const years = (at.getTime() - f.date.getTime()) / YEAR_MS;
    p10 += f.amount * growthFactor(years, returnPct, volPct, -Z90);
    p50 += f.amount * growthFactor(years, returnPct, volPct, 0);
    p90 += f.amount * growthFactor(years, returnPct, volPct, Z90);
  }
  // Net withdrawals can invert the band; keep it low → high for display.
  return { p10: Math.min(p10, p90), p50, p90: Math.max(p10, p90) };
}

/** Total put in up to and including `at`. */
export function contributedBy(flows: Flow[], at: Date): number {
  return flows.reduce((s, f) => (f.date <= at ? s + f.amount : s), 0);
}

/** First of each month strictly after `from`, up to `to` — to keep curves smooth. */
function monthStarts(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  while (d < to && out.length < 600) {
    out.push(new Date(d));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Income filed under these tax tags is a return on the money, not money put in.
const RETURN_TAGS = new Set(["interest", "dividend"]);

export async function investmentPerformance(userId: string, now = new Date()) {
  const [accounts, conv] = await Promise.all([
    prisma.account.findMany({
      where: { userId, closedAt: null, OR: [{ isInvestment: true }, { isPension: true }] },
      orderBy: { createdAt: "asc" },
    }),
    getConversion(userId),
  ]);
  const ids = accounts.map((a) => a.id);

  const [txns, transfers, valuations, balances] = ids.length
    ? await Promise.all([
        prisma.transaction.findMany({
          where: { userId, accountId: { in: ids }, date: { lte: now } },
          select: {
            accountId: true,
            date: true,
            amount: true,
            type: true,
            category: { select: { taxTag: true } },
          },
        }),
        prisma.transfer.findMany({
          where: {
            userId,
            date: { lte: now },
            OR: [{ fromAccountId: { in: ids } }, { toAccountId: { in: ids } }],
          },
          select: { fromAccountId: true, toAccountId: true, date: true, amount: true },
        }),
        prisma.accountValuation.findMany({
          where: { userId, accountId: { in: ids }, date: { lte: now } },
          orderBy: { date: "asc" },
        }),
        accountBalances(userId, now),
      ])
    : [[], [], [], new Map<string, number>()];

  const result = accounts.map((a) => {
    const expectedReturn = toNumber(a.interestRate);
    const volatility = toNumber(a.volatility);

    // Money put in: transfers in and out, plus deposits/withdrawals recorded as
    // transactions — but not interest or dividends, which are returns.
    const moves: Flow[] = [];
    for (const t of txns) {
      if (t.accountId !== a.id) continue;
      if (t.type === "income" && RETURN_TAGS.has(t.category.taxTag ?? "")) continue;
      const amt = toNumber(t.amount);
      moves.push({ date: t.date, amount: t.type === "income" ? amt : -amt });
    }
    for (const tr of transfers) {
      const amt = toNumber(tr.amount);
      if (tr.toAccountId === a.id) moves.push({ date: tr.date, amount: amt });
      if (tr.fromAccountId === a.id) moves.push({ date: tr.date, amount: -amt });
    }
    const vals = valuations.filter((v) => v.accountId === a.id);

    // Tracking starts when the account was added or its earliest dated
    // activity, whichever is first; the opening balance is put in then.
    const since = new Date(
      Math.min(
        a.createdAt.getTime(),
        ...moves.map((m) => m.date.getTime()),
        ...vals.map((v) => v.date.getTime())
      )
    );
    const flows: Flow[] = [...moves].sort((x, y) => x.date.getTime() - y.date.getTime());
    const opening = toNumber(a.openingBalance);
    if (opening !== 0) flows.unshift({ date: since, amount: opening });

    const value = balances.get(a.id) ?? 0;
    const contributed = contributedBy(flows, now);

    // Performance is judged at the latest recorded value: after it, the app
    // only knows what was added, not how the market moved.
    const last = vals.at(-1);
    let perf: {
      valuedAt: Date;
      valuedValue: number;
      contributedAtValuation: number;
      gain: number;
      gainPct: number | null;
      forecast: ForecastBand;
      vsForecast: number;
      position: "below" | "within" | "above";
    } | null = null;
    if (last) {
      const valuedValue = toNumber(last.value);
      const putIn = contributedBy(flows, last.date);
      const gain = valuedValue - putIn;
      const forecast = forecastAt(flows, last.date, expectedReturn, volatility);
      perf = {
        valuedAt: last.date,
        valuedValue: round2(valuedValue),
        contributedAtValuation: round2(putIn),
        gain: round2(gain),
        gainPct: putIn > 0 ? Math.round((gain / putIn) * 10000) / 100 : null,
        forecast: { p10: round2(forecast.p10), p50: round2(forecast.p50), p90: round2(forecast.p90) },
        vsForecast: round2(valuedValue - forecast.p50),
        position:
          valuedValue < forecast.p10 ? "below" : valuedValue > forecast.p90 ? "above" : "within",
      };
    }

    // Chart points: tracking start, every flow and valuation, month starts, today.
    const valueOn = new Map(vals.map((v) => [v.date.getTime(), toNumber(v.value)]));
    const times = new Set<number>([since.getTime(), now.getTime()]);
    for (const f of flows) times.add(f.date.getTime());
    for (const v of vals) times.add(v.date.getTime());
    for (const m of monthStarts(since, now)) times.add(m.getTime());
    const series = [...times]
      .sort((x, y) => x - y)
      .map((t) => {
        const at = new Date(t);
        const band = forecastAt(flows, at, expectedReturn, volatility);
        const point: {
          t: number;
          contributed: number;
          p10: number;
          p50: number;
          p90: number;
          actual?: number;
        } = {
          t,
          contributed: round2(contributedBy(flows, at)),
          p10: round2(band.p10),
          p50: round2(band.p50),
          p90: round2(band.p90),
        };
        // The actual line starts from what went in on day one, then joins the
        // recorded values. With nothing recorded there is no actual line.
        if (valueOn.has(t)) point.actual = round2(valueOn.get(t)!);
        else if (vals.length > 0 && t === since.getTime()) point.actual = point.contributed;
        return point;
      });

    return {
      id: a.id,
      name: a.name,
      currency: a.currency,
      isIsa: a.isIsa,
      isInvestment: a.isInvestment,
      isPension: a.isPension,
      expectedReturn,
      volatility,
      since,
      value: round2(value),
      contributed: round2(contributed),
      addedSinceValuation: perf ? round2(contributed - perf.contributedAtValuation) : 0,
      ...(perf ?? {
        valuedAt: null,
        valuedValue: null,
        contributedAtValuation: null,
        gain: null,
        gainPct: null,
        forecast: null,
        vsForecast: null,
        position: null,
      }),
      valuations: [...vals].reverse().map((v) => ({
        id: v.id,
        date: v.date,
        value: toNumber(v.value),
        note: v.note,
      })),
      series,
    };
  });

  // Totals in the base currency. Gain and "vs forecast" only cover accounts
  // with a recorded value — for the rest the app can't know how they've done.
  const toBase = (n: number, currency: string) => conv.toBase(n, currency);
  const valued = result.filter((a) => a.gain !== null);
  return {
    baseCurrency: conv.base,
    accounts: result,
    totals: {
      value: round2(result.reduce((s, a) => s + toBase(a.value, a.currency), 0)),
      contributed: round2(result.reduce((s, a) => s + toBase(a.contributed, a.currency), 0)),
      gain: round2(valued.reduce((s, a) => s + toBase(a.gain!, a.currency), 0)),
      contributedValued: round2(
        valued.reduce((s, a) => s + toBase(a.contributedAtValuation!, a.currency), 0)
      ),
      vsForecast: round2(valued.reduce((s, a) => s + toBase(a.vsForecast!, a.currency), 0)),
      valuedCount: valued.length,
    },
  };
}
