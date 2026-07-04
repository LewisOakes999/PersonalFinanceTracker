import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Banknote,
  Briefcase,
  Car,
  Clapperboard,
  CreditCard,
  Fuel,
  HeartPulse,
  Home,
  Percent,
  PiggyBank,
  ShoppingBag,
  ShoppingCart,
  Tag,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../api/client";
import type { Balances, CategoryTotal, Totals, Transaction } from "../types";
import {
  InvestmentBadge,
  IsaBadge,
  PbBadge,
  PensionBadge,
  SectionTitle,
  StatTile,
  Tile,
} from "../components/ui";
import { PeriodSelector } from "../components/PeriodSelector";
import { defaultPeriod, periodParams, type Period } from "../lib/period";
import { formatCurrency, formatDate, nextInterestDate } from "../lib/format";
import { useCurrency } from "../lib/CurrencyContext";

const INCOME = "#34e0c4";
const EXPENSE = "#ff6b8a";

/** Translucent tint of a #rrggbb colour for icon backgrounds. */
function tint(hex: string, alpha = 0.15): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return `rgba(255,255,255,${alpha})`;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  groceries: ShoppingCart,
  "dining out": UtensilsCrossed,
  dining: UtensilsCrossed,
  transport: Fuel,
  entertainment: Clapperboard,
  utilities: Zap,
  rent: Home,
  housing: Home,
  shopping: ShoppingBag,
  health: HeartPulse,
  salary: ArrowUpRight,
  freelance: Briefcase,
  interest: Percent,
};

function txnIcon(t: Transaction): LucideIcon {
  return CATEGORY_ICONS[t.category.name.toLowerCase()] ?? (t.type === "income" ? ArrowUpRight : Tag);
}

const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  credit: CreditCard,
  savings: PiggyBank,
  current: CreditCard,
  cash: Banknote,
  investment: TrendingUp,
};

const LIABILITY_ICONS: Record<string, LucideIcon> = {
  mortgage: Home,
  lease: Car,
  credit: CreditCard,
  loan: Banknote,
  other: Wallet,
};

const ASSET_ICONS: Record<string, LucideIcon> = {
  property: Home,
  vehicle: Car,
  cash: Banknote,
  valuables: Wallet,
  other: Wallet,
};

export default function Dashboard({ onAddAccount }: { onAddAccount?: () => void }) {
  const { format } = useCurrency();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod("month"));
  const [totals, setTotals] = useState<Totals | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [byCategory, setByCategory] = useState<CategoryTotal[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);

  useEffect(() => {
    const params = periodParams(period);
    api.totals(params).then(setTotals);
    api.byCategory(params, "expense").then(setByCategory);
    api.listTransactions(params).then((t) => setRecent(t.slice(0, 7)));
  }, [period]);

  useEffect(() => {
    api.balances().then(setBalances);
  }, []);

  const totalSpent = byCategory.reduce((s, c) => s + c.total, 0);
  const net = totals?.net ?? 0;
  const periodSub = period.label;

  return (
    <div className="space-y-4">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">Dashboard</h1>
          <p className="text-glass-3 mt-1 text-[13px]">Your money at a glance · {period.label}</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </header>

      {/* Summary tiles */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-4">
        <StatTile label="Income" value={format(totals?.income ?? 0)} tone="income" sub={periodSub} />
        <StatTile label="Expenses" value={format(totals?.expenses ?? 0)} tone="expense" sub={periodSub} />
        <StatTile
          label="Net"
          value={`${net >= 0 ? "+" : "−"}${format(Math.abs(net))}`}
          tone={net >= 0 ? "income" : "expense"}
          sub="income − expenses"
        />
        <StatTile
          label="Net Worth"
          value={format(balances?.netWorth ?? balances?.overall ?? 0)}
          tone="accent"
          sub={
            balances && balances.liabilitiesTotal > 0
              ? `${format(balances.assets)} assets − ${format(balances.liabilitiesTotal)} owed`
              : `${balances?.accounts.length ?? 0} accounts`
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Spending by category */}
        <Tile className="p-[22px]">
          <SectionTitle>Spending by Category</SectionTitle>
          {byCategory.length === 0 ? (
            <Empty>No expenses this month.</Empty>
          ) : (
            <div className="flex items-center gap-5">
              <div className="relative h-[172px] w-[172px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="total"
                      nameKey="category"
                      innerRadius={56}
                      outerRadius={84}
                      paddingAngle={2}
                      stroke="#08080b"
                      strokeWidth={2}
                    >
                      {byCategory.map((c) => (
                        <Cell key={c.categoryId} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => format(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-glass-3 text-[11px] uppercase tracking-[0.08em]">Spent</div>
                  <div className="num text-[21px] font-semibold tracking-tight text-glass">
                    {format(totalSpent)}
                  </div>
                </div>
              </div>
              <ul className="flex-1 space-y-[9px] text-[13px]">
                {byCategory.slice(0, 7).map((c) => (
                  <li key={c.categoryId} className="flex items-center justify-between">
                    <span className="flex min-w-0 items-center gap-2.5 text-glass">
                      <span
                        className="inline-block h-[10px] w-[10px] shrink-0 rounded-[3px]"
                        style={{ background: c.color }}
                      />
                      <span className="truncate">{c.category}</span>
                    </span>
                    <span className="num ml-2.5 shrink-0 text-glass">{format(c.total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Tile>

        {/* Recent transactions */}
        <Tile className="p-[22px]">
          <SectionTitle>Recent Transactions</SectionTitle>
          {recent.length === 0 ? (
            <Empty>No transactions this month.</Empty>
          ) : (
            <ul>
              {recent.map((t) => {
                const Icon = txnIcon(t);
                return (
                <li
                  key={t.id}
                  className="flex items-center justify-between border-b border-white/[0.06] py-[11px] last:border-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] border border-white/10 text-glass-2"
                      style={{ background: tint(t.category.color) }}
                    >
                      <Icon size={15} strokeWidth={1.75} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium text-glass">
                        {t.description || t.category.name}
                      </div>
                      <div className="text-glass-3 text-[11.5px]">
                        {formatDate(t.date)} · {t.category.name}
                      </div>
                    </div>
                  </div>
                  <span
                    className="num ml-2.5 shrink-0 text-[14px] font-[550]"
                    style={{ color: t.type === "income" ? INCOME : EXPENSE }}
                  >
                    {t.type === "income" ? "+" : "−"}
                    {format(t.amount)}
                  </span>
                </li>
                );
              })}
            </ul>
          )}
        </Tile>
      </div>

      {/* Balances by account */}
      <Tile className="p-[22px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
            Balances by Account
          </h2>
          {onAddAccount && (
            <button
              onClick={onAddAccount}
              className="text-glass-2 hover:text-glass glass-nested rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/10"
            >
              + Add account
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          {balances?.accounts.map((a) => {
            const AccountIcon = ACCOUNT_ICONS[a.type] ?? Wallet;
            return (
            <Tile key={a.id} nested rounded="rounded-tile" className="p-[18px]">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-[14px] font-medium text-glass">{a.name}</div>
                  {a.isIsa && <IsaBadge />}
                  {a.isPremiumBonds && <PbBadge />}
                  {a.isInvestment && <InvestmentBadge />}
                  {a.isPension && <PensionBadge />}
                </div>
                <div
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-glass-2"
                  style={{ background: tint("#0a84ff", 0.18) }}
                >
                  <AccountIcon size={13} strokeWidth={1.75} />
                </div>
              </div>
              <div className="text-glass-3 mt-0.5 text-[11px] uppercase tracking-[0.06em]">
                {a.type}
                {a.interestRate > 0 && ` · ${a.interestRate.toFixed(2)}% AER`}
              </div>
              <div
                className="num mt-3 text-[22px] font-semibold tracking-tight"
                style={{ color: a.balance < 0 ? EXPENSE : "var(--lg-text)" }}
              >
                {a.balance < 0 ? "−" : ""}
                {formatCurrency(Math.abs(a.balance), a.currency)}
              </div>
              {balances && a.currency !== balances.baseCurrency && (
                <div className="num text-glass-3 mt-0.5 text-[11px]">
                  ≈ {format(a.baseBalance)}
                </div>
              )}
              {a.maturityDate && (
                <div className="text-glass-3 mt-1 text-[11px]">
                  {nextInterestDate(a)
                    ? `Interest ${formatDate(nextInterestDate(a)!)}`
                    : `Matures ${formatDate(a.maturityDate)}`}
                </div>
              )}
            </Tile>
            );
          })}
        </div>
      </Tile>

      {/* Other assets */}
      {balances && (balances.otherAssets?.length ?? 0) > 0 && (
        <Tile className="p-[22px]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
              Other Assets
            </h2>
            {onAddAccount && (
              <button
                onClick={onAddAccount}
                className="text-glass-2 hover:text-glass glass-nested rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/10"
              >
                + Add asset
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {balances.otherAssets.map((a) => {
              const AssetIcon = ASSET_ICONS[a.type] ?? Wallet;
              return (
                <Tile key={a.id} nested rounded="rounded-tile" className="p-[18px]">
                  <div className="flex items-center justify-between">
                    <div className="truncate text-[14px] font-medium text-glass">{a.name}</div>
                    <div
                      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-glass-2"
                      style={{ background: tint(INCOME, 0.18) }}
                    >
                      <AssetIcon size={13} strokeWidth={1.75} />
                    </div>
                  </div>
                  <div className="text-glass-3 mt-0.5 text-[11px] uppercase tracking-[0.06em]">
                    {a.type}
                  </div>
                  <div
                    className="num mt-3 text-[22px] font-semibold tracking-tight"
                    style={{ color: "var(--lg-text)" }}
                  >
                    {formatCurrency(a.value, a.currency)}
                  </div>
                  {balances && a.currency !== balances.baseCurrency && (
                    <div className="num text-glass-3 mt-0.5 text-[11px]">≈ {format(a.baseValue)}</div>
                  )}
                </Tile>
              );
            })}
          </div>
        </Tile>
      )}

      {/* Liabilities */}
      {balances && (balances.liabilities?.length ?? 0) > 0 && (
        <Tile className="p-[22px]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
              Liabilities
            </h2>
            {onAddAccount && (
              <button
                onClick={onAddAccount}
                className="text-glass-2 hover:text-glass glass-nested rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/10"
              >
                + Add liability
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {balances.liabilities.map((l) => {
              const LiabilityIcon = LIABILITY_ICONS[l.type] ?? Banknote;
              return (
                <Tile key={l.id} nested rounded="rounded-tile" className="p-[18px]">
                  <div className="flex items-center justify-between">
                    <div className="truncate text-[14px] font-medium text-glass">{l.name}</div>
                    <div
                      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg text-glass-2"
                      style={{ background: tint(EXPENSE, 0.18) }}
                    >
                      <LiabilityIcon size={13} strokeWidth={1.75} />
                    </div>
                  </div>
                  <div className="text-glass-3 mt-0.5 text-[11px] uppercase tracking-[0.06em]">
                    {l.type}
                    {l.interestRate > 0 && ` · ${l.interestRate.toFixed(2)}%`}
                  </div>
                  <div
                    className="num mt-3 text-[22px] font-semibold tracking-tight"
                    style={{ color: EXPENSE }}
                  >
                    −{formatCurrency(l.balance, l.currency)}
                  </div>
                  {l.monthlyPayment > 0 && (
                    <div className="num text-glass-3 mt-0.5 text-[11px]">
                      {formatCurrency(l.monthlyPayment, l.currency)}/mo
                    </div>
                  )}
                  {balances && l.currency !== balances.baseCurrency && (
                    <div className="num text-glass-3 mt-0.5 text-[11px]">≈ {format(l.baseBalance)}</div>
                  )}
                </Tile>
              );
            })}
          </div>
        </Tile>
      )}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="text-glass-3 py-10 text-center text-sm">{children}</div>;
}

export const tooltipStyle = {
  background: "rgba(20,20,26,0.85)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  color: "#f5f5f7",
  fontSize: 12,
} as const;
