import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lightbulb, Minus } from "lucide-react";
import { api } from "../api/client";
import { useCurrency } from "../lib/CurrencyContext";
import { currentMonth } from "../lib/format";
import { defaultPeriod, periodParams } from "../lib/period";

// General money-saving advice, always available even before data loads.
const SAVING_TIPS = [
  "Automate saving: set up a standing order for the day after payday.",
  "Aim for an emergency fund of 3–6 months of essential expenses.",
  "Use your £20,000 ISA allowance before the tax year ends on 5 April.",
  "Review your subscriptions each month and cancel what you don't use.",
  "Clear high-interest debt before saving beyond your emergency fund.",
  "Name your savings goals — a specific target is far easier to hit.",
  "Move idle cash into a higher-rate savings account or Premium Bonds.",
  "Try a 24-hour pause before any non-essential purchase over £50.",
];

const ROTATE_MS = 7000;

/** A rotating tips panel: personalised insights (budgets, ISA) + general advice. */
export function SidebarTips() {
  const { format } = useCurrency();
  const [tips, setTips] = useState<string[]>(SAVING_TIPS);
  const [i, setI] = useState(0);
  const paused = useRef(false);
  const [minimised, setMin] = useState(() => {
    try {
      return localStorage.getItem("ss_tips_min") === "1";
    } catch {
      return false;
    }
  });
  const setMinimised = (v: boolean) => {
    setMin(v);
    try {
      localStorage.setItem("ss_tips_min", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  // Build personalised tips from the user's own data.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const personal: string[] = [];
      try {
        const params = periodParams(defaultPeriod("month"));
        const [budgets, isa, totals, cats, goals, balances] = await Promise.all([
          api.listBudgets(currentMonth()).catch(() => []),
          api.isaAllowance().catch(() => null),
          api.totals(params).catch(() => null),
          api.byCategory(params, "expense").catch(() => []),
          api.listGoals().catch(() => []),
          api.balances().catch(() => null),
        ]);

        // Budgets closest to (or over) their limit.
        const ranked = budgets
          .filter((b) => b.amount > 0)
          .map((b) => ({ ...b, pct: b.spent / b.amount }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 2);
        for (const b of ranked) {
          const pct = Math.round(b.pct * 100);
          if (b.pct >= 1) {
            personal.push(`You're ${format(b.spent - b.amount)} over your ${b.category.name} budget this month.`);
          } else if (b.pct >= 0.75) {
            personal.push(`${pct}% of your ${b.category.name} budget used — ${format(b.amount - b.spent)} left this month.`);
          } else {
            personal.push(`On track: ${pct}% of your ${b.category.name} budget used, ${format(b.amount - b.spent)} to spare.`);
          }
        }

        // Savings rate this month.
        if (totals) {
          if (totals.net > 0) {
            personal.push(`You've saved ${format(totals.net)} so far this month — nice work.`);
          } else if (totals.net < 0) {
            personal.push(`You've spent ${format(-totals.net)} more than you've earned this month. Ease off where you can.`);
          }
        }

        // Biggest spending category this month.
        if (cats.length) {
          personal.push(`Your biggest expense this month is ${format(cats[0].total)} on ${cats[0].category}.`);
        }

        // ISA allowance.
        if (isa?.hasIsa) {
          personal.push(
            isa.remaining > 0
              ? `ISA: ${format(isa.used)} of ${format(isa.allowance)} used — ${format(isa.remaining)} of allowance left this tax year.`
              : `You've fully used your ${format(isa.allowance)} ISA allowance this tax year.`
          );
        }

        // Nearest-to-start goal.
        const openGoals = goals
          .filter((g) => g.remaining > 0 && g.targetAmount > 0)
          .sort((a, b) => a.saved / a.targetAmount - b.saved / b.targetAmount);
        if (openGoals.length) {
          const g = openGoals[0];
          const pct = Math.min(100, Math.round((g.saved / g.targetAmount) * 100));
          personal.push(`You're ${pct}% toward “${g.name}” — ${format(g.remaining)} to go.`);
        }

        // Net worth.
        const n = balances?.accounts?.filter((a) => !a.closedAt).length ?? 0;
        if (balances && n > 0) {
          personal.push(`Your net worth is ${format(balances.overall)} across ${n} account${n > 1 ? "s" : ""}.`);
        }
      } catch {
        /* fall back to general tips */
      }
      if (!cancelled && personal.length) setTips([...personal, ...SAVING_TIPS]);
    })();
    return () => {
      cancelled = true;
    };
  }, [format]);

  // Auto-advance (pauses on hover).
  useEffect(() => {
    const id = setInterval(() => {
      if (!paused.current) setI((n) => (n + 1) % tips.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [tips.length]);

  if (tips.length === 0) return null;
  const go = (n: number) => setI(((n % tips.length) + tips.length) % tips.length);

  // Collapsed: just the lightbulb, tucked into the bottom-left. Click to reopen.
  if (minimised) {
    return (
      <div className="flex">
        <button
          onClick={() => setMinimised(false)}
          aria-label="Show saving tips"
          title="Show saving tips"
          className="glass-nested text-glass-3 hover:text-glass flex h-9 w-9 items-center justify-center rounded-xl transition-colors hover:bg-white/5"
        >
          <Lightbulb size={16} strokeWidth={2} />
        </button>
      </div>
    );
  }

  return (
    <div
      className="glass-nested rounded-2xl px-3 py-2.5"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-glass-3 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
          <Lightbulb size={11} strokeWidth={2} /> Tip
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => go(i - 1)}
            aria-label="Previous tip"
            className="text-glass-3 hover:text-glass flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/10"
          >
            <ChevronLeft size={13} strokeWidth={2} />
          </button>
          <button
            onClick={() => go(i + 1)}
            aria-label="Next tip"
            className="text-glass-3 hover:text-glass flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/10"
          >
            <ChevronRight size={13} strokeWidth={2} />
          </button>
          <button
            onClick={() => setMinimised(true)}
            aria-label="Minimise tips"
            title="Minimise"
            className="text-glass-3 hover:text-glass ml-0.5 flex h-5 w-5 items-center justify-center rounded-md hover:bg-white/10"
          >
            <Minus size={13} strokeWidth={2} />
          </button>
        </div>
      </div>
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {tips.map((t, idx) => (
            <p key={idx} className="text-glass-2 flex min-h-[84px] w-full shrink-0 items-start text-[12px] leading-relaxed">
              {t}
            </p>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap justify-center gap-1">
        {tips.map((_, idx) => (
          <span
            key={idx}
            className={`h-1 w-1 rounded-full ${idx === i ? "bg-balance" : "bg-white/20"}`}
          />
        ))}
      </div>
    </div>
  );
}
