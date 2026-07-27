import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Banknote,
  Briefcase,
  Car,
  Check,
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
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { api } from "../api/client";
import type {
  Balances,
  CategoryTotal,
  SpendingInsights,
  Totals,
  Transaction,
  Upcoming,
} from "../types";
import {
  Button,
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
import { currentMonth, formatCurrency, formatDate, nextInterestDate } from "../lib/format";
import { useCurrency } from "../lib/CurrencyContext";
import { useAuth } from "../lib/AuthContext";

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

export default function Dashboard({
  onManage,
  onGoTo,
  onViewAccount,
}: {
  /** Open Settings with the given section (accounts | assets | liabilities) expanded. */
  onManage?: (section: string) => void;
  /** Navigate to another tab (e.g. "transactions"). */
  onGoTo?: (tab: string) => void;
  onViewAccount?: (accountId: string) => void;
}) {
  const { format } = useCurrency();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod("month"));
  const [totals, setTotals] = useState<Totals | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [byCategory, setByCategory] = useState<CategoryTotal[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [insights, setInsights] = useState<SpendingInsights | null>(null);
  const [upcoming, setUpcoming] = useState<Upcoming | null>(null);
  // Setup-guide progress. null = still checking.
  const [hasHistory, setHasHistory] = useState<boolean | null>(null);
  const [hasBudgetOrGoal, setHasBudgetOrGoal] = useState<boolean | null>(null);
  const { user } = useAuth();
  const guideKey = `ss_guide_hidden_${user?.email ?? ""}`;
  const [guideDismissed, setGuideDismissed] = useState(() => {
    try {
      return localStorage.getItem(guideKey) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const params = periodParams(period);
    api.totals(params).then(setTotals);
    api.byCategory(params, "expense").then(setByCategory);
    api.listTransactions(params).then((t) => setRecent(t.slice(0, 5)));
  }, [period]);

  useEffect(() => {
    api.balances().then(setBalances);
    api.insights().then(setInsights);
    api.upcoming(45).then(setUpcoming);
    api.trend(12).then((t) => setHasHistory(t.some((m) => m.income > 0 || m.expenses > 0)));
    // For the setup guide's third step: any budget this month, or any goal.
    Promise.all([
      api.listBudgets(currentMonth()).catch(() => []),
      api.listGoals().catch(() => []),
    ]).then(([b, g]) => setHasBudgetOrGoal(b.length > 0 || g.length > 0));
  }, []);

  // Every new user gets a £0 starter account, so "accounts added" means more
  // than that: a second account, or a real balance on any account.
  const step1Done =
    !!balances && (balances.accounts.length > 1 || balances.accounts.some((a) => a.balance !== 0));
  const step2Done = hasHistory === true;
  const step3Done = hasBudgetOrGoal === true;
  const guideLoaded = balances !== null && hasHistory !== null && hasBudgetOrGoal !== null;
  const showGuide = guideLoaded && !guideDismissed && !(step1Done && step2Done && step3Done);
  const dismissGuide = () => {
    setGuideDismissed(true);
    try {
      localStorage.setItem(guideKey, "1");
    } catch {
      /* ignore */
    }
  };

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

      {/* First-run guide: steps tick off as they're completed, and the panel
          disappears once all are done (or when dismissed with the ✕). */}
      {showGuide && (
        <Tile className="relative p-6">
          <button
            onClick={dismissGuide}
            aria-label="Close setup guide"
            title="Close — you can find everything in the sidebar"
            className="text-glass-3 hover:text-glass absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-white/10"
          >
            <X size={15} strokeWidth={2} />
          </button>
          <h2 className="text-glass pr-10 text-[17px] font-semibold tracking-tight">
            Let's set up your finances
          </h2>
          <p className="text-glass-3 mt-1 text-[13px]">
            Three quick steps and this dashboard fills itself in. This guide disappears once
            they're all done.
          </p>
          <ol className="mt-4 space-y-3">
            {[
              {
                n: 1,
                done: step1Done,
                title: "Add your accounts",
                desc: "Current, savings, ISA, credit card — with today's balance.",
                action: onManage && (
                  <Button variant="primary" onClick={() => onManage("accounts")}>
                    Add an account
                  </Button>
                ),
              },
              {
                n: 2,
                done: step2Done,
                title: "Record your money in and out",
                desc: "Add transactions by hand or import a CSV from your bank.",
                action: onGoTo && (
                  <Button onClick={() => onGoTo("transactions")}>Go to Transactions</Button>
                ),
              },
              {
                n: 3,
                done: step3Done,
                title: "Set a budget or a goal",
                desc: "Give a category a monthly limit, or set a savings target.",
                action: onGoTo && <Button onClick={() => onGoTo("budgets")}>Go to Budgets</Button>,
              },
            ].map((s) => (
              <li key={s.n} className="flex flex-wrap items-center gap-3">
                <span
                  className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white"
                  style={{
                    background: s.done
                      ? "rgba(52,224,196,0.9)"
                      : "linear-gradient(140deg,#0a84ff,#30d5c8)",
                  }}
                >
                  {s.done ? <Check size={14} strokeWidth={2.5} /> : s.n}
                </span>
                <span className={`min-w-0 flex-1 ${s.done ? "opacity-55" : ""}`}>
                  <span
                    className={`text-glass block text-[14px] font-medium ${s.done ? "line-through" : ""}`}
                  >
                    {s.title}
                  </span>
                  <span className="text-glass-3 block text-[12px]">
                    {s.done ? "Done!" : s.desc}
                  </span>
                </span>
                {!s.done && s.action}
              </li>
            ))}
          </ol>
        </Tile>
      )}

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
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-glass-3 text-sm">Nothing recorded for this period yet.</p>
              {onGoTo && (
                <Button onClick={() => onGoTo("transactions")}>+ Add a transaction</Button>
              )}
            </div>
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

      {/* Upcoming and insights sit side by side on wide screens to keep the
          dashboard short. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {upcoming && upcoming.items.length > 0 && (
        <Tile className="p-[22px]">
          <SectionTitle>Upcoming · next {upcoming.days} days</SectionTitle>
          <ul className="divide-y divide-white/10">
            {upcoming.items.slice(0, 8).map((it, i) => {
              const amtColor =
                it.type === "income" ? INCOME : it.type === "transfer" ? undefined : EXPENSE;
              const sign = it.type === "income" ? "+" : it.type === "transfer" ? "" : "−";
              return (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="num w-14 shrink-0 text-[11px] text-glass-3">
                      {formatDate(it.date).slice(0, 6)}
                    </span>
                    {it.categoryColor && (
                      <span
                        className="inline-block h-[10px] w-[10px] shrink-0 rounded-[3px]"
                        style={{ backgroundColor: it.categoryColor }}
                      />
                    )}
                    <span className="truncate text-glass">{it.description}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-4">
                    <span className="num" style={{ color: amtColor }}>
                      {sign}
                      {format(it.amount)}
                    </span>
                    <span
                      className="num text-[11px] text-glass-3"
                      style={{ color: it.runningBalance < 0 ? EXPENSE : undefined }}
                    >
                      {format(it.runningBalance)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Tile>
      )}

      {/* Spending insights: month-over-month movers + round-up pot */}
      {insights && insights.movers.length > 0 && (
        <Tile className="p-[22px]">
          <SectionTitle>Spending Insights · vs last month</SectionTitle>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-glass-3">This month</span>
            <span className="num text-glass font-medium">{format(insights.totalThisMonth)}</span>
            {(() => {
              const diff = insights.totalThisMonth - insights.totalPrevMonth;
              const up = diff > 0;
              return (
                <span className="num text-xs" style={{ color: up ? EXPENSE : INCOME }}>
                  {up ? "↑" : "↓"} {format(Math.abs(diff))} vs {format(insights.totalPrevMonth)} last month
                </span>
              );
            })()}
          </div>
          {insights.roundUp > 0 && (
            <p className="text-glass-3 mb-4 text-[13px]">
              💰 Rounding each purchase up to the nearest whole amount would have set aside{" "}
              <span className="num text-[#34e0c4]">{format(insights.roundUp)}</span> this month.
            </p>
          )}
          <ul className="space-y-2">
            {insights.movers.map((m) => {
              const up = m.change > 0;
              return (
                <li key={m.category} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-glass">
                    <span
                      className="inline-block h-[10px] w-[10px] shrink-0 rounded-[3px]"
                      style={{ backgroundColor: m.color }}
                    />
                    {m.category}
                  </span>
                  <span className="num text-glass-3">
                    {format(m.thisMonth)}{" "}
                    <span
                      className="text-xs"
                      style={{ color: m.change === 0 ? undefined : up ? EXPENSE : INCOME }}
                    >
                      {m.change === 0 ? "· no change" : `${up ? "↑" : "↓"} ${format(Math.abs(m.change))}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Tile>
      )}
      </div>

      {/* Net worth composition — accounts, other assets and debts in one
          compact panel rather than three tall grids of cards. */}
      <Tile className="p-[22px]">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
            Net Worth
          </h2>
          {balances && (
            <span className="num text-glass text-[15px] font-semibold">
              {format(balances.netWorth ?? balances.overall ?? 0)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-3">
          {/* Accounts */}
          <NetWorthColumn
            title="Accounts"
            total={balances ? format(balances.accountsTotal ?? balances.overall ?? 0) : ""}
            onAdd={onManage ? () => onManage("accounts") : undefined}
            addLabel="+ Add account"
            empty={
              balances && balances.accounts.length === 0
                ? "No accounts yet — add your bank, savings and credit accounts."
                : undefined
            }
          >
            {balances?.accounts.map((a) => (
              <NetWorthRow
                key={a.id}
                icon={ACCOUNT_ICONS[a.type] ?? Wallet}
                iconTint={tint("#0a84ff", 0.18)}
                name={a.name}
                title={[
                  a.type,
                  a.interestRate > 0 ? `${a.interestRate.toFixed(2)}% AER` : null,
                  a.maturityDate
                    ? nextInterestDate(a)
                      ? `interest ${formatDate(nextInterestDate(a)!)}`
                      : `matures ${formatDate(a.maturityDate)}`
                    : null,
                  balances && a.currency !== balances.baseCurrency
                    ? `≈ ${format(a.baseBalance)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                badges={
                  <>
                    {a.isIsa && <IsaBadge />}
                    {a.isPremiumBonds && <PbBadge />}
                    {a.isInvestment && <InvestmentBadge />}
                    {a.isPension && <PensionBadge />}
                  </>
                }
                amount={`${a.balance < 0 ? "−" : ""}${formatCurrency(Math.abs(a.balance), a.currency)}`}
                amountColor={a.balance < 0 ? EXPENSE : undefined}
                onClick={onViewAccount ? () => onViewAccount(a.id) : undefined}
              />
            ))}
          </NetWorthColumn>

          {/* Other assets */}
          <NetWorthColumn
            title="Other assets"
            total={balances ? format(balances.otherAssetsTotal ?? 0) : ""}
            onAdd={onManage ? () => onManage("assets") : undefined}
            addLabel="+ Add asset"
            empty={
              balances && (balances.otherAssets?.length ?? 0) === 0
                ? "Property, vehicles and valuables you own."
                : undefined
            }
          >
            {balances?.otherAssets?.map((a) => (
              <NetWorthRow
                key={a.id}
                icon={ASSET_ICONS[a.type] ?? Wallet}
                iconTint={tint(INCOME, 0.18)}
                name={a.name}
                title={[
                  a.type,
                  balances && a.currency !== balances.baseCurrency
                    ? `≈ ${format(a.baseValue)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                amount={formatCurrency(a.value, a.currency)}
              />
            ))}
          </NetWorthColumn>

          {/* Liabilities */}
          <NetWorthColumn
            title="Owed"
            total={balances ? `−${format(balances.liabilitiesTotal ?? 0)}` : ""}
            totalColor={EXPENSE}
            onAdd={onManage ? () => onManage("liabilities") : undefined}
            addLabel="+ Add liability"
            empty={
              balances && (balances.liabilities?.length ?? 0) === 0
                ? "Loans, mortgages and other debts."
                : undefined
            }
          >
            {balances?.liabilities?.map((l) => (
              <NetWorthRow
                key={l.id}
                icon={LIABILITY_ICONS[l.type] ?? Banknote}
                iconTint={tint(EXPENSE, 0.18)}
                name={l.name}
                title={[
                  l.type,
                  l.interestRate > 0 ? `${l.interestRate.toFixed(2)}%` : null,
                  l.monthlyPayment > 0
                    ? `${formatCurrency(l.monthlyPayment, l.currency)}/mo`
                    : null,
                  balances && l.currency !== balances.baseCurrency
                    ? `≈ ${format(l.baseBalance)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                amount={`−${formatCurrency(l.balance, l.currency)}`}
                amountColor={EXPENSE}
              />
            ))}
          </NetWorthColumn>
        </div>
      </Tile>
    </div>
  );
}

/** One column of the net-worth breakdown: heading, subtotal, add link, rows. */
function NetWorthColumn({
  title,
  total,
  totalColor,
  onAdd,
  addLabel,
  empty,
  children,
}: {
  title: string;
  total: string;
  totalColor?: string;
  onAdd?: () => void;
  addLabel: string;
  empty?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2 border-b border-white/10 pb-1.5">
        <span className="text-glass-3 text-[11px] font-semibold uppercase tracking-[0.06em]">
          {title}
        </span>
        <span className="num text-[12px]" style={{ color: totalColor ?? "var(--lg-text-2)" }}>
          {total}
        </span>
      </div>
      {empty ? (
        <p className="text-glass-3 py-2 text-[12px]">{empty}</p>
      ) : (
        <div>{children}</div>
      )}
      {onAdd && (
        <button
          onClick={onAdd}
          className="text-glass-3 hover:text-glass mt-1.5 text-[12px] transition-colors"
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

/** A single dense line: icon, name, badges … amount. Details live in the tooltip. */
function NetWorthRow({
  icon: Icon,
  iconTint,
  name,
  title,
  badges,
  amount,
  amountColor,
  onClick,
}: {
  icon: LucideIcon;
  iconTint: string;
  name: string;
  title?: string;
  badges?: ReactNode;
  amount: string;
  amountColor?: string;
  onClick?: () => void;
}) {
  return (
    <div
      title={title || undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`-mx-1.5 flex items-center justify-between gap-2 rounded-md px-1.5 py-[5px] ${
        onClick ? "cursor-pointer transition-colors hover:bg-white/[0.06]" : ""
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-glass-2"
          style={{ background: iconTint }}
        >
          <Icon size={10} strokeWidth={2} />
        </span>
        <span className="truncate text-[13px] text-glass">{name}</span>
        {badges}
      </span>
      <span
        className="num shrink-0 text-[13px] font-medium"
        style={{ color: amountColor ?? "var(--lg-text)" }}
      >
        {amount}
      </span>
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
