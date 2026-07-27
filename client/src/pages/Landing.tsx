import {
  ArrowLeftRight,
  ChartPie,
  Heart,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Button, Tile } from "../components/ui";
import { BrandTile } from "../components/BrandMark";

// TODO: replace with your own donation link (Buy Me a Coffee, Ko-fi, GitHub
// Sponsors, PayPal, etc.).
const DONATE_URL = "https://www.buymeacoffee.com/";

const MODULES: { icon: LucideIcon; title: string; blurb: string }[] = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    blurb:
      "Your money at a glance — net worth, income, expenses and per-account balances, plus spending insights, round-ups and upcoming bills.",
  },
  {
    icon: ArrowLeftRight,
    title: "Transactions",
    blurb:
      "Add, search, filter and tag; import (with a template) or export CSV, print a PDF statement, split a purchase and attach receipts.",
  },
  {
    icon: ChartPie,
    title: "Analytics",
    blurb:
      "Net worth over time, income-vs-expenses trends, a spending-by-category drill-down and automatic subscription detection.",
  },
  {
    icon: Wallet,
    title: "Budgets",
    blurb: "Set a monthly limit per category and track spending against it with clear progress bars.",
  },
  {
    icon: Target,
    title: "Goals",
    blurb: "Savings targets, tracked manually or linked to an account's live balance.",
  },
  {
    icon: TrendingUp,
    title: "Forecast",
    blurb:
      "Project your cash flow and net worth, model debt paydown, and run a Monte Carlo cone for investments — in today's money if you like.",
  },
  {
    icon: ReceiptText,
    title: "Tax",
    blurb:
      "A UK tax-year summary — income, taxable interest & dividends, pension & Gift Aid — plus a rough tax estimate.",
  },
  {
    icon: Settings,
    title: "Accounts & Settings",
    blurb:
      "Accounts, liabilities and other assets for a true net worth, fixed-term ISAs, auto-categorisation rules, live currency rates, valuations, light/dark theme and backups.",
  },
];

const HIGHLIGHTS = [
  "Private & self-hosted",
  "Net worth: assets & liabilities",
  "Multi-currency + live rates",
  "Auto-categorisation",
  "Monte Carlo forecasting",
  "UK tax figures",
  "Installable app · light & dark",
  "Full backup & restore",
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <BrandTile />
      <div>
        <div className="text-glass text-[15px] font-semibold tracking-tight">SuperSaver</div>
        <div className="text-glass-3 text-xs tracking-wide">Save smarter</div>
      </div>
    </div>
  );
}

export default function Landing({
  onLogin,
  onSignup,
}: {
  onLogin: () => void;
  onSignup: () => void;
}) {
  return (
    <div className="relative min-h-screen w-full overflow-x-hidden">
      <div className="relative z-[1] mx-auto max-w-5xl px-5 py-8 sm:py-12">
        {/* Top bar */}
        <header className="mb-12 flex items-center justify-between gap-3 sm:mb-16">
          <Brand />
          <div className="flex gap-2">
            <Button onClick={onLogin}>Log in</Button>
            <Button variant="primary" onClick={onSignup}>
              Sign up
            </Button>
          </div>
        </header>

        {/* Hero — deliberately left-aligned, ragged-right */}
        <section className="mb-16 max-w-3xl sm:mb-20">
          <div className="text-glass-3 text-xs font-medium uppercase tracking-[0.14em]">
            Free · Self-hosted · Private
          </div>
          <h1 className="text-glass mt-4 text-[34px] font-semibold leading-[1.08] tracking-tight sm:text-[52px]">
            Take control of your money.
          </h1>
          <p className="text-glass-2 mt-4 max-w-2xl text-[15px] sm:text-[17px]">
            Your net worth, every account, budget, goal, forecast and UK tax figure in one clean,
            private place — running on your own machine. No ads, no data harvesting, no subscription.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button variant="primary" onClick={onSignup} className="!px-5 !py-2.5 text-[15px]">
              Get started — it's free
            </Button>
            <Button onClick={onLogin} className="!px-5 !py-2.5 text-[15px]">
              Log in
            </Button>
          </div>
        </section>

        {/* Modules */}
        <section>
          <h2 className="text-glass mb-1 text-[24px] font-semibold tracking-tight">
            Everything in one app
          </h2>
          <p className="text-glass-3 mb-7 text-[13px]">Each module, at a glance.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((m) => (
              <Tile key={m.title} rounded="rounded-glass" className="p-5">
                <div
                  className="text-balance flex h-[38px] w-[38px] items-center justify-center rounded-xl"
                  style={{ background: "rgba(100,210,255,0.12)" }}
                >
                  <m.icon size={17} strokeWidth={1.75} />
                </div>
                <div className="text-glass mt-3 text-[15px] font-semibold">{m.title}</div>
                <p className="text-glass-3 mt-1.5 text-[13px] leading-relaxed">{m.blurb}</p>
              </Tile>
            ))}
          </div>
        </section>

        {/* Highlights — a quiet single line, not a wall of pills */}
        <section className="text-glass-3 mt-10 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
          {HIGHLIGHTS.map((h, i) => (
            <span key={h} className="flex items-center gap-x-3">
              {i > 0 && <span aria-hidden>·</span>}
              {h}
            </span>
          ))}
        </section>

        {/* Donate */}
        <section className="mt-16 sm:mt-20">
          <Tile className="flex flex-col gap-6 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
            <div className="max-w-xl">
              <h2 className="text-glass text-[22px] font-semibold tracking-tight">
                Free forever — donations keep it going
              </h2>
              <p className="text-glass-2 mt-2 text-[14px]">
                This app is completely free to use. If it helps you stay on top of your finances
                and you'd like to support its development, a small donation is hugely appreciated —
                but never required.
              </p>
            </div>
            <a href={DONATE_URL} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button variant="primary" className="inline-flex items-center gap-2 !px-6 !py-2.5 text-[15px]">
                <Heart size={15} strokeWidth={2} /> Donate
              </Button>
            </a>
          </Tile>
          <p className="text-glass-3 mt-6 text-xs">
            Your data stays on your own server. © {new Date().getFullYear()} SuperSaver.
          </p>
        </section>
      </div>
    </div>
  );
}
