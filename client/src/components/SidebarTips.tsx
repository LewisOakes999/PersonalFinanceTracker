import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useCurrency } from "../lib/CurrencyContext";
import { currentMonth } from "../lib/format";

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

  // Build personalised tips from the user's budgets + ISA usage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const personal: string[] = [];
      try {
        const [budgets, isa] = await Promise.all([
          api.listBudgets(currentMonth()).catch(() => []),
          api.isaAllowance().catch(() => null),
        ]);
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
        if (isa?.hasIsa) {
          personal.push(
            isa.remaining > 0
              ? `ISA: ${format(isa.used)} of ${format(isa.allowance)} used — ${format(isa.remaining)} of allowance left this tax year.`
              : `Nice — you've fully used your ${format(isa.allowance)} ISA allowance this tax year.`
          );
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

  return (
    <div
      className="glass-nested rounded-2xl px-3 py-2.5"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-glass-3 text-[10px] font-semibold uppercase tracking-wider">💡 Tip</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => go(i - 1)}
            aria-label="Previous tip"
            className="text-glass-3 hover:text-glass flex h-5 w-5 items-center justify-center rounded-md text-base leading-none hover:bg-white/10"
          >
            ‹
          </button>
          <button
            onClick={() => go(i + 1)}
            aria-label="Next tip"
            className="text-glass-3 hover:text-glass flex h-5 w-5 items-center justify-center rounded-md text-base leading-none hover:bg-white/10"
          >
            ›
          </button>
        </div>
      </div>
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${i * 100}%)` }}
        >
          {tips.map((t, idx) => (
            <p key={idx} className="text-glass-2 min-h-[52px] w-full shrink-0 text-[12px] leading-snug">
              {t}
            </p>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap justify-center gap-1">
        {tips.map((_, idx) => (
          <span
            key={idx}
            className={`h-1 w-1 rounded-full ${idx === i ? "bg-[#64d2ff]" : "bg-white/20"}`}
          />
        ))}
      </div>
    </div>
  );
}
