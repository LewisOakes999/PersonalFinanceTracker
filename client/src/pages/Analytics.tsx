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
  NetWorthPoint,
  Subscriptions,
  Transaction,
  TrendPoint,
} from "../types";
import { SectionTitle, Tile } from "../components/ui";
import { PeriodSelector } from "../components/PeriodSelector";
import { defaultPeriod, periodParams, type Period } from "../lib/period";
import { formatDate, shortMonthLabel } from "../lib/format";
import { useCurrency } from "../lib/CurrencyContext";
import { tooltipStyle } from "./Dashboard";

const INCOME = "#34e0c4";
const EXPENSE = "#ff6b8a";
const NETWORTH = "#64d2ff";
const AXIS = "rgba(245,245,247,0.45)";

export default function Analytics() {
  const { format } = useCurrency();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod("month"));
  const [byCategory, setByCategory] = useState<CategoryTotal[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [netWorth, setNetWorth] = useState<NetWorthPoint[]>([]);
  const [selectedCat, setSelectedCat] = useState<CategoryTotal | null>(null);
  const [drill, setDrill] = useState<Transaction[]>([]);
  const [subs, setSubs] = useState<Subscriptions | null>(null);

  useEffect(() => {
    api.byCategory(periodParams(period), "expense").then((data) => {
      setByCategory(data);
      setSelectedCat(data[0] ?? null);
    });
  }, [period]);

  useEffect(() => {
    api.trend(12).then(setTrend);
    api.netWorth(12).then(setNetWorth);
    api.subscriptions().then(setSubs);
  }, []);

  useEffect(() => {
    if (!selectedCat) {
      setDrill([]);
      return;
    }
    api
      .listTransactions({ ...periodParams(period), categoryId: selectedCat.categoryId })
      .then(setDrill);
  }, [selectedCat, period]);

  const trendData = useMemo(
    () => trend.map((t) => ({ ...t, label: shortMonthLabel(t.month) })),
    [trend]
  );
  const netWorthData = useMemo(
    () => netWorth.map((p) => ({ ...p, label: shortMonthLabel(p.month) })),
    [netWorth]
  );

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

      {/* Income vs expenses over time */}
      <Tile className="p-[22px]">
        <SectionTitle>Income vs Expenses (last 12 months)</SectionTitle>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
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
              <Bar dataKey="income" name="Income" fill={INCOME} radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill={EXPENSE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Tile>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Spending by category (horizontal bars) */}
        <Tile className="p-[22px]">
          <SectionTitle>Spending by Category — {period.label}</SectionTitle>
          {byCategory.length === 0 ? (
            <div className="text-glass-3 py-10 text-center text-sm">No expenses this month.</div>
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
                  <Bar dataKey="total" name="Spent" radius={[0, 4, 4, 0]}>
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

        {/* Category drill-down */}
        <Tile className="p-[22px]">
          <SectionTitle>Category Drill-down</SectionTitle>
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
              No transactions for this category and month.
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
                  <span className="num" style={{ color: EXPENSE }}>
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
