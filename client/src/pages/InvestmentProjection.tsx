import { useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import type { Account, InvestmentForecast } from "../types";
import { Field, InvestmentBadge, IsaBadge, SectionTitle, StatTile, Tile } from "../components/ui";
import { shortMonthLabel } from "../lib/format";
import { profileLabel } from "../lib/riskProfiles";
import { realFactor } from "../lib/inflation";
import { useCurrency } from "../lib/CurrencyContext";
import { tooltipStyle } from "./Dashboard";

const MEDIAN = "#64d2ff";
const BAND = "#0a84ff";
const INVESTED = "rgba(245,245,247,0.55)";
const AXIS = "rgba(245,245,247,0.45)";
const YEARS = [5, 10, 20, 30];

export default function InvestmentProjection() {
  const { format } = useCurrency();
  const [investAccounts, setInvestAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState(""); // "" = all combined
  const [years, setYears] = useState(10);
  const [contribution, setContribution] = useState("200");
  const [target, setTarget] = useState("");
  const [realTerms, setRealTerms] = useState(false);
  const [inflation, setInflation] = useState("2.5");
  const [data, setData] = useState<InvestmentForecast | null>(null);

  useEffect(() => {
    api.listAccounts().then((all) => setInvestAccounts(all.filter((a) => a.isInvestment)));
  }, []);

  useEffect(() => {
    api
      .investmentForecast({
        accountId: accountId || undefined,
        months: years * 12,
        monthlyContribution: contribution === "" ? 0 : Number(contribution),
        target: target === "" ? undefined : Number(target),
      })
      .then(setData);
  }, [accountId, years, contribution, target]);

  const inflPct = realTerms ? Number(inflation) || 0 : 0;
  const deflate = (v: number, monthIndex: number) => v * realFactor(inflPct, monthIndex);

  const chartData = useMemo(
    () =>
      (data?.months ?? []).map((m) => {
        const f = realFactor(inflPct, m.monthIndex);
        return {
          label: shortMonthLabel(m.month),
          p10: m.p10 * f,
          band: (m.p90 - m.p10) * f,
          p50: m.p50 * f,
          p90: m.p90 * f,
          invested: m.invested * f,
        };
      }),
    [data, inflPct]
  );

  if (investAccounts.length === 0) {
    return (
      <Tile className="p-[22px]">
        <SectionTitle>Investment Projection</SectionTitle>
        <p className="text-glass-3 text-sm">
          Mark an account as an <span className="text-glass">Investment</span> in Settings (and set
          an expected return + volatility) to project variable returns with a confidence range.
        </p>
      </Tile>
    );
  }

  const s = data?.summary;

  return (
    <Tile className="p-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle>Investment Projection · Monte Carlo</SectionTitle>
        {data && (
          <span className="num text-glass-3 text-xs">
            {data.expectedReturn.toFixed(1)}% expected · {data.volatility.toFixed(0)}% volatility
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Field label="Account">
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {investAccounts.length > 1 && <option value="">All investments</option>}
            {investAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Horizon">
          <select className="num" value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y} years
              </option>
            ))}
          </select>
        </Field>
        <Field label="Monthly contribution">
          <input
            type="number"
            min="0"
            step="10"
            className="num w-32"
            value={contribution}
            onChange={(e) => setContribution(e.target.value)}
          />
        </Field>
        <Field label="Target (optional)">
          <input
            type="number"
            min="0"
            step="1000"
            className="num w-32"
            placeholder="e.g. 50000"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm text-glass">
          <input
            type="checkbox"
            checked={realTerms}
            onChange={(e) => setRealTerms(e.target.checked)}
          />
          Today's money
        </label>
        {realTerms && (
          <Field label="Inflation %">
            <input
              type="number"
              step="0.1"
              min="0"
              className="num w-20"
              value={inflation}
              onChange={(e) => setInflation(e.target.value)}
            />
          </Field>
        )}
      </div>

      {/* Summary tiles */}
      {s && (
        <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          <StatTile
            label={`Median in ${years}y`}
            value={format(deflate(s.finalP50, years * 12))}
            tone="accent"
            sub={`${format(deflate(s.finalP10, years * 12))} – ${format(
              deflate(s.finalP90, years * 12)
            )} (p10–p90)`}
          />
          <StatTile
            label="Total Invested"
            value={format(deflate(s.invested, years * 12))}
            sub={realTerms ? "cost basis · today's money" : "cost basis"}
          />
          <StatTile
            label="Median Profit"
            value={`${s.medianProfit >= 0 ? "+" : "−"}${format(
              Math.abs(deflate(s.medianProfit, years * 12))
            )}`}
            tone={s.medianProfit >= 0 ? "income" : "expense"}
          />
          <StatTile
            label={data?.target ? `Chance of ${format(data.target)}` : "Chance of Profit"}
            value={`${Math.round((data?.target ? s.probTarget ?? 0 : s.probProfit) * 100)}%`}
            tone="default"
            sub={data?.target ? `${Math.round(s.probProfit * 100)}% chance of any profit` : undefined}
          />
        </div>
      )}

      {/* Cone chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="coneFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BAND} stopOpacity={0.32} />
                <stop offset="100%" stopColor={BAND} stopOpacity={0.08} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke={AXIS}
              fontSize={12}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              stroke={AXIS}
              fontSize={12}
              tickLine={false}
              width={72}
              tickFormatter={(v: number) => format(v).replace(/\.00$/, "")}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v: number, n: string) => [format(v), n]}
              labelFormatter={(l) => `Month: ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {/* Stacked areas form the p10–p90 band (lower transparent, delta visible). */}
            <Area
              dataKey="p10"
              stackId="band"
              stroke="none"
              fill="transparent"
              name="p10"
              legendType="none"
              tooltipType="none"
            />
            <Area
              dataKey="band"
              stackId="band"
              stroke="none"
              fill="url(#coneFill)"
              name="p10–p90 range"
            />
            <Line
              type="monotone"
              dataKey="p50"
              name="Median"
              stroke={MEDIAN}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="invested"
              name="Invested"
              stroke={INVESTED}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p className="text-glass-3 mt-3 text-xs">
        2,000 simulated paths assuming lognormal returns. The shaded band is the 10th–90th
        percentile of outcomes; the line is the median. Anything above the dashed line is profit.
        Assumptions are illustrative — not investment advice; actual returns vary and past
        performance doesn't predict the future.
      </p>

      {/* Accounts in scope */}
      {data && data.accounts.length > 0 && (
        <ul className="mt-4 divide-y divide-white/10">
          {data.accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-glass">
                {a.name}
                {a.isIsa && <IsaBadge />}
                <InvestmentBadge />
              </span>
              <span className="text-glass-3 text-right">
                <span className="num">{format(a.startingBalance)}</span> ·{" "}
                {profileLabel(a.expectedReturn, a.volatility)}{" "}
                <span className="num">
                  ({a.expectedReturn.toFixed(1)}% · {a.volatility.toFixed(0)}% vol)
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}
