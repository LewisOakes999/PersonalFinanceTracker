import { Bloom, Button, Tile } from "../components/ui";
import { BrandTile } from "../components/BrandMark";

// TODO: replace with your own donation link (Buy Me a Coffee, Ko-fi, GitHub
// Sponsors, PayPal, etc.).
const DONATE_URL = "https://www.buymeacoffee.com/";

const MODULES: { icon: string; title: string; blurb: string }[] = [
  {
    icon: "◧",
    title: "Dashboard",
    blurb:
      "Your money at a glance — income, expenses, net and per-account balances for any month, year or tax year.",
  },
  {
    icon: "⇅",
    title: "Transactions",
    blurb:
      "Add, search and filter, import & export CSV, split one purchase across categories, and attach receipts.",
  },
  {
    icon: "◔",
    title: "Analytics",
    blurb:
      "Net worth over time, income-vs-expenses trends and a spending-by-category breakdown with drill-down.",
  },
  {
    icon: "◫",
    title: "Budgets",
    blurb: "Set a monthly limit per category and track spending against it with clear progress bars.",
  },
  {
    icon: "⌖",
    title: "Goals",
    blurb: "Savings targets, tracked manually or linked to an account's live balance.",
  },
  {
    icon: "↗",
    title: "Forecast",
    blurb:
      "Project future cash flow, and run a Monte Carlo confidence cone for investments — in today's money if you like.",
  },
  {
    icon: "▤",
    title: "Tax",
    blurb:
      "A UK tax-year summary — income, taxable interest & dividends, pension & Gift Aid — plus a rough tax estimate.",
  },
  {
    icon: "⚙",
    title: "Accounts & Settings",
    blurb:
      "Current, savings, credit, ISA, Premium Bonds, investment and pension accounts, currencies & rates, valuations and backups.",
  },
];

const HIGHLIGHTS = [
  "Private & self-hosted",
  "Multi-currency",
  "Recurring & transfers",
  "Monte Carlo forecasting",
  "UK tax figures",
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
      <Bloom />
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

        {/* Hero */}
        <section className="mb-16 text-center sm:mb-20">
          <span className="glass-nested text-glass-2 inline-block rounded-full px-3 py-1 text-xs uppercase tracking-[0.12em]">
            Free · Self-hosted · Private
          </span>
          <h1 className="text-glass mx-auto mt-5 max-w-3xl text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[52px]">
            Take control of your money.
          </h1>
          <p className="text-glass-2 mx-auto mt-4 max-w-2xl text-[15px] sm:text-[17px]">
            Every account, budget, goal, forecast and UK tax figure in one clean, private place —
            running on your own machine. No ads, no data harvesting, no subscription.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
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
          <h2 className="text-glass mb-1 text-center text-[24px] font-semibold tracking-tight">
            Everything in one app
          </h2>
          <p className="text-glass-3 mb-7 text-center text-[13px]">Each module, at a glance.</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map((m) => (
              <Tile key={m.title} rounded="rounded-glass" className="p-5">
                <div
                  className="flex h-[38px] w-[38px] items-center justify-center rounded-xl text-[18px] text-[#64d2ff]"
                  style={{ background: "rgba(100,210,255,0.12)" }}
                >
                  {m.icon}
                </div>
                <div className="text-glass mt-3 text-[15px] font-semibold">{m.title}</div>
                <p className="text-glass-3 mt-1.5 text-[13px] leading-relaxed">{m.blurb}</p>
              </Tile>
            ))}
          </div>
        </section>

        {/* Highlights */}
        <section className="mt-10 flex flex-wrap justify-center gap-2.5">
          {HIGHLIGHTS.map((h) => (
            <span
              key={h}
              className="glass-nested text-glass-2 rounded-full px-3.5 py-1.5 text-[13px]"
            >
              {h}
            </span>
          ))}
        </section>

        {/* Donate */}
        <section className="mt-16 sm:mt-20">
          <Tile className="p-8 text-center sm:p-10">
            <div className="text-[28px]">♥</div>
            <h2 className="text-glass mt-2 text-[22px] font-semibold tracking-tight">
              Free forever — donations keep it going
            </h2>
            <p className="text-glass-2 mx-auto mt-2 max-w-xl text-[14px]">
              This app is completely free to use. If it helps you stay on top of your finances and
              you'd like to support its development, a small donation is hugely appreciated — but
              never required.
            </p>
            <a href={DONATE_URL} target="_blank" rel="noopener noreferrer">
              <Button variant="primary" className="mt-6 !px-6 !py-2.5 text-[15px]">
                ♥ Donate
              </Button>
            </a>
          </Tile>
          <p className="text-glass-3 mt-6 text-center text-xs">
            Your data stays on your own server. © {new Date().getFullYear()} SuperSaver.
          </p>
        </section>
      </div>
    </div>
  );
}
