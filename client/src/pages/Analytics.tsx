import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import type {
  CategoryTotal,
  InvestmentPerformance,
  NetWorthPoint,
  Subscriptions,
  Transaction,
  TrendPoint,
} from "../types";
import { SectionTitle, Tile } from "../components/ui";
import { PeriodSelector } from "../components/PeriodSelector";
import { buildPeriod, defaultPeriod, periodParams, type Period } from "../lib/period";
import {
  formatCurrency,
  formatDate,
  formatSigned,
  formatSignedPct,
  shortMonthLabel,
} from "../lib/format";
import { fittedDomain } from "../lib/chart";
import { useCurrency } from "../lib/CurrencyContext";
import { tooltipStyle } from "./Dashboard";

const INCOME = "#34e0c4";
const EXPENSE = "#ff6b8a";

/** The bit of Recharts' click payload we rely on. */
type BarClickState = { activePayload?: { payload?: { month?: string } }[] } | null;
/** Which side of the ledger the category chart and drill-down are showing. */
type CatType = "expense" | "income";
const NETWORTH = "#64d2ff";
const AXIS = "rgba(245,245,247,0.45)";

export default function Analytics({ onGoTo }: { onGoTo?: (tab: string) => void } = {}) {
  const { format } = useCurrency();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod("month"));
  const [catType, setCatType] = useState<CatType>("expense");
  const [byCategory, setByCategory] = useState<CategoryTotal[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [netWorth, setNetWorth] = useState<NetWorthPoint[]>([]);
  const [selectedCat, setSelectedCat] = useState<CategoryTotal | null>(null);
  const [drill, setDrill] = useState<Transaction[]>([]);
  const [subs, setSubs] = useState<Subscriptions | null>(null);
  const [invest, setInvest] = useState<InvestmentPerformance | null>(null);

  const isIncome = catType === "income";

  useEffect(() => {
    api.byCategory(periodParams(period), catType).then((data) => {
      setByCategory(data);
      setSelectedCat(data[0] ?? null);
    });
  }, [period, catType]);

  /** Switching income/expenses drops the old categories so the drill-down
   *  below never shows the previous side's transactions while loading. */
  const selectCatType = (t: CatType) => {
    if (t === catType) return;
    setCatType(t);
    setByCategory([]);
    setSelectedCat(null);
  };

  useEffect(() => {
    api.trend(12).then(setTrend);
    api.netWorth(12).then(setNetWorth);
    api.subscriptions().then(setSubs);
    api.investmentPerformance().then(setInvest).catch(() => setInvest(null));
  }, []);

  useEffect(() => {
    if (!selectedCat) {
      setDrill([]);
      return;
    }
    api
      .listTransactions({
        ...periodParams(period),
        categoryId: selectedCat.categoryId,
        type: catType,
      })
      .then(setDrill);
  }, [selectedCat, period, catType]);

  const trendData = useMemo(
    () => trend.map((t) => ({ ...t, label: shortMonthLabel(t.month) })),
    [trend]
  );
  const netWorthData = useMemo(
    () => netWorth.map((p) => ({ ...p, label: shortMonthLabel(p.month) })),
    [netWorth]
  );

  // Which bar (if any) the rest of the page is currently scoped to. Only a
  // month-mode period corresponds to a single bar.
  const selectedMonth =
    period.mode === "month"
      ? `${period.year}-${String(period.month).padStart(2, "0")}`
      : null;
  // The page opens on the current month, so that state isn't a "selection" —
  // keep showing the hint until the user actually picks a different month.
  const thisMonth = defaultPeriod("month");
  const isCurrentMonth =
    period.mode === "month" &&
    period.year === thisMonth.year &&
    period.month === thisMonth.month;
  // Dim the other bars only once a month has actually been picked, so the
  // chart doesn't arrive looking half-disabled.
  const highlightMonth = isCurrentMonth ? null : selectedMonth;

  /** Clicking a bar scopes the page's period to that month. */
  const selectMonth = (month: string) => {
    const [year, m] = month.split("-").map(Number);
    if (!year || !m) return;
    setPeriod(
      buildPeriod({
        mode: "month",
        year,
        month: m,
        from: `${month}-01`,
        to: `${month}-01`,
      })
    );
  };

  return (
    <div className="space-y-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">Analytics</h1>
          <p className="text-glass-3 mt-1 text-[13px]">Trends and category breakdowns</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </header>

      {/* Detected subscriptions */}
      {subs && subs.subscriptions.length > 0 && (
        <Tile className="p-[22px]">
          <SectionTitle>Detected Subscriptions</SectionTitle>
          <p className="text-glass-3 mb-3 text-xs">
            Recurring charges spotted in your history ·{" "}
            <span className="num text-glass-2">{format(subs.totalMonthly)}</span>/mo ·{" "}
            <span className="num text-glass-2">{format(subs.totalAnnual)}</span>/yr
          </p>
          <ul className="divide-y divide-white/10">
            {subs.subscriptions.map((s, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-glass">
                  <span className="truncate">{s.name}</span>
                  <span className="text-glass-3 shrink-0 text-xs">
                    · {s.frequency} · last {formatDate(s.lastDate).slice(0, 6)}
                  </span>
                </span>
                <span className="num shrink-0 text-glass-2">
                  {format(s.amount)}{" "}
                  <span className="text-glass-3 text-xs">({format(s.monthlyCost)}/mo)</span>
                </span>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      {/* Net worth over time */}
      <Tile className="p-[22px]">
        <SectionTitle>Net Worth Over Time (last 12 months)</SectionTitle>
        {netWorthData.length > 1 &&
          (() => {
            const first = netWorthData[0].netWorth;
            const last = netWorthData[netWorthData.length - 1].netWorth;
            const diff = last - first;
            const pct = first !== 0 ? (diff / Math.abs(first)) * 100 : 0;
            const up = diff >= 0;
            return (
              <p className="text-glass-3 -mt-2 mb-3 text-[13px]">
                <span className="num" style={{ color: up ? INCOME : EXPENSE }}>
                  {up ? "↑" : "↓"} {format(Math.abs(diff))}
                  {first !== 0 && ` (${up ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)`}
                </span>{" "}
                over the period · now <span className="num text-glass-2">{format(last)}</span>
              </p>
            );
          })()}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={netWorthData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="nwFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={NETWORTH} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={NETWORTH} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} />
              <YAxis
                stroke={AXIS}
                fontSize={12}
                tickLine={false}
                width={70}
                // Fitted, not zero-anchored — net worth sits far from zero, so a
                // zero baseline would flatten a year of movement into a few pixels.
                domain={fittedDomain(netWorthData.map((p) => p.netWorth))}
                tickFormatter={(v: number) => format(v).replace(/\.00$/, "")}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => format(v)} />
              <Area
                type="monotone"
                dataKey="netWorth"
                name="Net worth"
                stroke={NETWORTH}
                strokeWidth={2}
                fill="url(#nwFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Tile>

      {/* Unrealised gains on investments — point-in-time, so the period doesn't apply */}
      {invest && invest.accounts.length > 0 && (
        <UnrealisedGains data={invest} onOpen={onGoTo ? () => onGoTo("investments") : undefined} />
      )}

      {/* Income vs expenses over time — click a month to focus the page on it */}
      <Tile className="p-[22px]">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
            Income vs Expenses (last 12 months)
          </h2>
          <span className="text-glass-3 text-[12px]">
            {isCurrentMonth ? (
              "Click a month to see its breakdown below"
            ) : (
              <>
                Showing <span className="text-glass-2">{period.label}</span> ·{" "}
                <button
                  onClick={() => setPeriod(defaultPeriod("month"))}
                  className="text-[#64d2ff] hover:underline"
                >
                  back to this month
                </button>
              </>
            )}
          </span>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={trendData}
              margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
              className="cursor-pointer"
              onClick={(state: BarClickState) => {
                const month = state?.activePayload?.[0]?.payload?.month;
                if (month) selectMonth(month);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} />
              <YAxis
                stroke={AXIS}
                fontSize={12}
                tickLine={false}
                tickFormatter={(v: number) => format(v).replace(/\.00$/, "")}
                width={70}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                formatter={(v: number, name: string) => [format(v), name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {/* When a month is selected, the others dim so the choice is obvious. */}
              <Bar dataKey="income" name="Income" fill={INCOME} radius={[4, 4, 0, 0]}>
                {trendData.map((d) => (
                  <Cell
                    key={d.month}
                    fill={INCOME}
                    fillOpacity={!highlightMonth || d.month === highlightMonth ? 1 : 0.28}
                  />
                ))}
              </Bar>
              <Bar dataKey="expenses" name="Expenses" fill={EXPENSE} radius={[4, 4, 0, 0]}>
                {trendData.map((d) => (
                  <Cell
                    key={d.month}
                    fill={EXPENSE}
                    fillOpacity={!highlightMonth || d.month === highlightMonth ? 1 : 0.28}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Tile>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Income / spending by category (horizontal bars) */}
        <Tile className="p-[22px]">
          {/* One toggle drives this chart and the drill-down beside it. */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
              {isIncome ? "Income" : "Spending"} by Category — {period.label}
            </h2>
            <div className="flex gap-1" role="group" aria-label="Income or expenses">
              {(["expense", "income"] as CatType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => selectCatType(t)}
                  aria-pressed={catType === t}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    catType === t
                      ? t === "income"
                        ? "border-[#34e0c4] bg-[#34e0c4]/10 text-[#34e0c4]"
                        : "border-[#ff6b8a] bg-[#ff6b8a]/10 text-[#ff9bae]"
                      : "border-white/10 bg-white/5 text-glass-3 hover:text-glass"
                  }`}
                >
                  {t === "income" ? "Income" : "Expenses"}
                </button>
              ))}
            </div>
          </div>
          {byCategory.length === 0 ? (
            <div className="text-glass-3 py-10 text-center text-sm">
              No {isIncome ? "income" : "expenses"} in {period.label}.
            </div>
          ) : (
            <div style={{ height: Math.max(byCategory.length * 38, 120) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={byCategory}
                  margin={{ top: 0, right: 16, bottom: 0, left: 8 }}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="category"
                    stroke={AXIS}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    formatter={(v: number) => format(v)}
                  />
                  <Bar dataKey="total" name={isIncome ? "Received" : "Spent"} radius={[0, 4, 4, 0]}>
                    {byCategory.map((c) => (
                      <Cell
                        key={c.categoryId}
                        fill={c.color}
                        cursor="pointer"
                        onClick={() => setSelectedCat(c)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Tile>

        {/* Category drill-down — follows the toggle above */}
        <Tile className="p-[22px]">
          <SectionTitle>{isIncome ? "Income" : "Expense"} Drill-down</SectionTitle>
          <div className="mb-3 flex items-center">
            <select
              value={selectedCat?.categoryId ?? ""}
              onChange={(e) =>
                setSelectedCat(byCategory.find((c) => c.categoryId === e.target.value) ?? null)
              }
            >
              {byCategory.length === 0 && <option value="">No categories</option>}
              {byCategory.map((c) => (
                <option key={c.categoryId} value={c.categoryId}>
                  {c.category}
                </option>
              ))}
            </select>
            {selectedCat && (
              <span className="num text-glass-3 ml-3 text-sm">{format(selectedCat.total)} total</span>
            )}
          </div>
          {drill.length === 0 ? (
            <div className="text-glass-3 py-10 text-center text-sm">
              No {isIncome ? "income" : "expenses"} for this category in {period.label}.
            </div>
          ) : (
            <ul className="max-h-72 overflow-auto">
              {drill.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between border-b border-white/[0.06] py-2 text-sm last:border-0"
                >
                  <div>
                    <div className="text-glass">{t.description || t.category.name}</div>
                    <div className="text-glass-3 text-xs">{formatDate(t.date)}</div>
                  </div>
                  <span className="num" style={{ color: isIncome ? INCOME : EXPENSE }}>
                    {isIncome ? "+" : "−"}
                    {format(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>
    </div>
  );
}

/** Each investment account's gain on what was put in, as of its latest recorded value. */
function UnrealisedGains({ data, onOpen }: { data: InvestmentPerformance; onOpen?: () => void }) {
  const { format } = useCurrency();
  const t = data.totals;
  // Bars are scaled to the biggest % move, so accounts compare at a glance.
  const maxPct = Math.max(0, ...data.accounts.map((a) => Math.abs(a.gainPct ?? 0)));
  const totalPct = t.contributedValued > 0 ? (t.gain / t.contributedValued) * 100 : 0;

  return (
    <Tile className="p-[22px]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
          Unrealised Gains
        </h2>
        {onOpen && (
          <button onClick={onOpen} className="text-[12px] text-[#64d2ff] hover:underline">
            Record values on Investments
          </button>
        )}
      </div>
      {t.valuedCount === 0 ? (
        <p className="text-glass-3 -mt-2 mb-3 text-[13px]">
          No values recorded yet — record what your investments are worth on the Investments tab to
          see how they've done.
        </p>
      ) : (
        <p className="text-glass-3 -mt-2 mb-3 text-[13px]">
          <span className="num font-semibold" style={{ color: t.gain >= 0 ? INCOME : EXPENSE }}>
            {formatSigned(t.gain, format)} ({formatSignedPct(totalPct)})
          </span>{" "}
          on <span className="num text-glass-2">{format(t.contributedValued)}</span> put in · as of
          each account's latest value
        </p>
      )}
      <ul className="divide-y divide-white/10">
        {data.accounts.map((a) => {
          const fmt = (n: number) => formatCurrency(n, a.currency);
          const color = a.gain === null ? undefined : a.gain >= 0 ? INCOME : EXPENSE;
          return (
            <li
              key={a.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-2.5 text-sm sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]"
            >
              <div className="min-w-0">
                <div className="truncate text-glass">{a.name}</div>
                <div className="num text-glass-3 text-xs">
                  {a.valuedAt
                    ? `put in ${fmt(a.contributedAtValuation!)} · worth ${fmt(a.valuedValue!)} · ${formatDate(a.valuedAt)}`
                    : `put in ${fmt(a.contributed)} · not valued yet`}
                </div>
              </div>
              <GainBar pct={a.gainPct} max={maxPct} />
              <div className="num text-right" style={{ color }}>
                <div>{a.gain === null ? "—" : formatSigned(a.gain, fmt)}</div>
                {a.gainPct !== null && <div className="text-xs">{formatSignedPct(a.gainPct)}</div>}
              </div>
            </li>
          );
        })}
      </ul>
    </Tile>
  );
}

/** A bar growing right (gain) or left (loss) from a centre line. */
function GainBar({ pct, max }: { pct: number | null; max: number }) {
  const half = pct === null || max === 0 ? 0 : Math.min(50, (Math.abs(pct) / max) * 50);
  return (
    <div className="relative hidden h-2 rounded-full bg-white/[0.06] sm:block" aria-hidden>
      <div className="absolute inset-y-[-3px] left-1/2 w-px bg-white/25" />
      {pct !== null && half > 0 && (
        <div
          className="absolute inset-y-0 rounded-full"
          style={{
            left: pct >= 0 ? "50%" : `${50 - half}%`,
            width: `${half}%`,
            background: pct >= 0 ? INCOME : EXPENSE,
          }}
        />
      )}
    </div>
  );
}
