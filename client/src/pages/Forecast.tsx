import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import type { Forecast as ForecastData, IsaAllowance } from "../types";
import { Field, IsaBadge, PbBadge, SectionTitle, StatTile, Tile } from "../components/ui";
import { formatMonthLabel, shortMonthLabel } from "../lib/format";
import { useCurrency } from "../lib/CurrencyContext";
import { tooltipStyle } from "./Dashboard";
import InvestmentProjection from "./InvestmentProjection";

const INCOME = "#34e0c4";
const EXPENSE = "#ff6b8a";
const INTEREST = "#64d2ff";
const AXIS = "rgba(245,245,247,0.45)";

const HORIZONS = [6, 12, 24, 36];

export default function Forecast() {
  const { format } = useCurrency();
  const [months, setMonths] = useState(12);
  const [income, setIncome] = useState(""); // empty = use historical average
  const [expenses, setExpenses] = useState("");
  const [data, setData] = useState<ForecastData | null>(null);
  const [isa, setIsa] = useState<IsaAllowance | null>(null);

  useEffect(() => {
    api
      .forecast({
        months,
        monthlyIncome: income === "" ? undefined : Number(income),
        monthlyExpenses: expenses === "" ? undefined : Number(expenses),
      })
      .then(setData);
  }, [months, income, expenses]);

  useEffect(() => {
    api.isaAllowance().then(setIsa);
  }, []);

  const chartData = useMemo(
    () => (data?.months ?? []).map((m) => ({ ...m, label: shortMonthLabel(m.month) })),
    [data]
  );

  // Bar chart gets only the cashflow fields — including `balance` here would
  // skew its Y-axis domain (balances are ~10x larger than monthly flows).
  const barData = useMemo(
    () =>
      (data?.months ?? []).map((m) => ({
        label: shortMonthLabel(m.month),
        income: m.income,
        expenses: m.expenses,
        interest: m.interest,
      })),
    [data]
  );

  if (!data) {
    return <div className="text-glass-3 py-20 text-center text-sm">Loading forecast…</div>;
  }

  const horizonLabel =
    data.months.length > 0
      ? `${formatMonthLabel(data.months[0].month)} – ${formatMonthLabel(
          data.months[data.months.length - 1].month
        )}`
      : "";

  const showNetWorth = data.startingLiabilities > 0 || data.otherAssets > 0;
  const payoffLabel = (monthIndex: number) =>
    data.months[monthIndex - 1] ? formatMonthLabel(data.months[monthIndex - 1].month) : "";

  return (
    <div className="space-y-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">Forecast</h1>
          <p className="text-glass-3 mt-1 text-[13px]">
            Projected income, expenses and interest · {horizonLabel}
          </p>
        </div>
        <select
          aria-label="Horizon"
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="num"
        >
          {HORIZONS.map((h) => (
            <option key={h} value={h}>
              Next {h} months
            </option>
          ))}
        </select>
      </header>

      {/* Totals over the horizon */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-4">
        <StatTile label="Projected Income" value={format(data.totals.income)} tone="income" />
        <StatTile
          label="Projected Expenses"
          value={format(data.totals.expenses)}
          tone="expense"
        />
        <StatTile
          label="Projected Interest"
          value={format(data.totals.interest)}
          tone="accent"
          sub={
            data.totals.taxFreeInterest > 0
              ? `${format(data.totals.taxFreeInterest)} tax-free (ISA/PB)`
              : undefined
          }
        />
        <StatTile
          label="Ending Balance"
          value={format(data.endingBalance)}
          tone={data.endingBalance >= 0 ? "income" : "expense"}
          sub={`from ${format(data.startingBalance)} today`}
        />
        {(data.startingLiabilities > 0 || data.otherAssets > 0) && (
          <StatTile
            label="Projected Net Worth"
            value={format(data.endingNetWorth)}
            tone={data.endingNetWorth >= 0 ? "income" : "expense"}
            sub={`from ${format(data.startingNetWorth)} today`}
          />
        )}
      </div>

      {/* Assumptions */}
      <Tile className="p-5">
        <SectionTitle>Assumptions</SectionTitle>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Monthly income">
            <input
              type="number"
              step="0.01"
              min="0"
              className="num w-36"
              placeholder={format(data.assumptions.avgIncome)}
              value={income}
              onChange={(e) => setIncome(e.target.value)}
            />
          </Field>
          <Field label="Monthly expenses">
            <input
              type="number"
              step="0.01"
              min="0"
              className="num w-36"
              placeholder={format(data.assumptions.avgExpenses)}
              value={expenses}
              onChange={(e) => setExpenses(e.target.value)}
            />
          </Field>
          <p className="text-glass-3 pb-2 text-xs">
            Leave blank to use your {data.assumptions.lookbackMonths}-month average
            ({format(data.assumptions.avgIncome)} in, {format(data.assumptions.avgExpenses)} out).
            Interest compounds each account's AER monthly.
          </p>
        </div>
      </Tile>

      {/* ISA allowance */}
      {isa && isa.hasIsa && (
        <Tile className="p-[22px]">
          <SectionTitle>ISA Allowance · {isa.taxYearLabel} tax year</SectionTitle>
          <div className="num mb-2 flex items-baseline justify-between">
            <span className="text-[22px] font-semibold tracking-tight text-glass">
              {format(isa.used)} <span className="text-glass-3 text-sm">used</span>
            </span>
            <span className="text-glass-3 text-sm">of {format(isa.allowance)} allowance</span>
          </div>
          <div className="glass-nested h-2.5 w-full overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full ${isa.used > isa.allowance ? "bg-expense" : "bg-income"}`}
              style={{ width: `${Math.min((isa.used / isa.allowance) * 100, 100)}%` }}
            />
          </div>
          <p className="text-glass-3 mt-2 text-xs">
            {format(isa.remaining)} remaining this tax year (6 Apr – 5 Apr). Counts transfers
            into {isa.isaAccounts.map((a) => a.name).join(", ")} from non-ISA accounts. Withdrawals
            don't restore allowance.
          </p>
        </Tile>
      )}

      {/* Investment Monte Carlo projection */}
      <InvestmentProjection />

      {/* Projected balance */}
      <Tile className="p-[22px]">
        <SectionTitle>
          {showNetWorth ? "Projected Balance & Net Worth" : "Projected Total Balance"}
        </SectionTitle>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={INTEREST} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={INTEREST} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={INCOME} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={INCOME} stopOpacity={0.02} />
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
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [format(v), n]} />
              {showNetWorth && <Legend wrapperStyle={{ fontSize: 12 }} />}
              <Area
                type="monotone"
                dataKey="balance"
                name="Balance"
                stroke={INTEREST}
                strokeWidth={2}
                fill="url(#balanceFill)"
              />
              {showNetWorth && (
                <Area
                  type="monotone"
                  dataKey="netWorth"
                  name="Net Worth"
                  stroke={INCOME}
                  strokeWidth={2}
                  fill="url(#netWorthFill)"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Tile>

      {/* Debt paydown */}
      {(data.liabilities?.length ?? 0) > 0 && (
        <Tile className="p-[22px]">
          <SectionTitle>Debt Paydown</SectionTitle>
          <p className="text-glass-3 mb-3 text-xs">
            Projected from each debt's monthly payment and interest. Assumes payments continue as part
            of your regular expenses.
          </p>
          <ul className="divide-y divide-white/10">
            {data.liabilities.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-glass">
                  <span className="truncate">{l.name}</span>
                  <span className="text-glass-3 text-xs uppercase tracking-wide">{l.type}</span>
                </span>
                <span className="num shrink-0 text-glass-3">
                  {format(l.startingBalance)} <span className="text-glass-3">→</span>{" "}
                  <span
                    className={l.projectedBalance === 0 ? "" : "text-glass"}
                    style={l.projectedBalance === 0 ? { color: INCOME } : undefined}
                  >
                    {format(l.projectedBalance)}
                  </span>
                  {l.payoffMonth != null && (
                    <span className="ml-2 text-xs" style={{ color: INCOME }}>
                      cleared {payoffLabel(l.payoffMonth)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Tile>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Monthly cashflow + interest */}
        <Tile className="p-[22px]">
          <SectionTitle>Monthly Income, Expenses & Interest</SectionTitle>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} />
                <YAxis
                  stroke={AXIS}
                  fontSize={12}
                  tickLine={false}
                  width={64}
                  tickFormatter={(v: number) => format(v).replace(/\.00$/, "")}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  formatter={(v: number, n: string) => [format(v), n]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Income" fill={INCOME} radius={[3, 3, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill={EXPENSE} radius={[3, 3, 0, 0]} />
                <Bar dataKey="interest" name="Interest" fill={INTEREST} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tile>

        {/* Interest-bearing accounts */}
        <Tile className="p-[22px]">
          <SectionTitle>Accounts & Interest Rates</SectionTitle>
          <ul className="divide-y divide-white/10">
            {data.accounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-glass">
                  <span className="truncate">{a.name}</span>
                  {a.isIsa && <IsaBadge />}
                  {a.isPremiumBonds && <PbBadge />}
                  <span className="num text-glass-3 text-xs">{a.interestRate.toFixed(2)}%</span>
                </span>
                <span className="num shrink-0 text-glass-3">
                  {format(a.startingBalance)}{" "}
                  <span className="text-glass-3">→</span>{" "}
                  <span className="text-glass">{format(a.projectedBalance)}</span>
                </span>
              </li>
            ))}
            {data.accounts.length === 0 && (
              <li className="text-glass-3 py-6 text-center text-sm">No accounts yet.</li>
            )}
          </ul>
        </Tile>
      </div>

      {/* Monthly breakdown */}
      <Tile className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-glass-3">
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Income</th>
              <th className="px-4 py-3 text-right">Expenses</th>
              <th className="px-4 py-3 text-right">Interest</th>
              <th className="px-4 py-3 text-right">Net</th>
              <th className="px-4 py-3 text-right">Balance</th>
              {showNetWorth && <th className="px-4 py-3 text-right">Net Worth</th>}
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month} className="border-b border-white/10 hover:bg-white/5">
                <td className="num whitespace-nowrap px-4 py-2 text-glass-3">
                  {formatMonthLabel(m.month)}
                </td>
                <td className="num px-4 py-2 text-right" style={{ color: INCOME }}>
                  {format(m.income)}
                </td>
                <td className="num px-4 py-2 text-right" style={{ color: EXPENSE }}>
                  {format(m.expenses)}
                </td>
                <td className="num px-4 py-2 text-right" style={{ color: INTEREST }}>
                  {format(m.interest)}
                </td>
                <td
                  className="num px-4 py-2 text-right"
                  style={{ color: m.net >= 0 ? INCOME : EXPENSE }}
                >
                  {m.net >= 0 ? "+" : "−"}
                  {format(Math.abs(m.net))}
                </td>
                <td className="num px-4 py-2 text-right text-glass">{format(m.balance)}</td>
                {showNetWorth && (
                  <td className="num px-4 py-2 text-right text-glass">{format(m.netWorth)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Tile>
    </div>
  );
}
