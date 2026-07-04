import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeftRight,
  ChartPie,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Settings as SettingsIcon,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "./lib/AuthContext";
import { BrandTile } from "./components/BrandMark";
import { SidebarTips } from "./components/SidebarTips";
import { Onboarding } from "./components/Onboarding";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Analytics from "./pages/Analytics";
import Budgets from "./pages/Budgets";
import Goals from "./pages/Goals";
import Forecast from "./pages/Forecast";
import Tax from "./pages/Tax";
import Settings from "./pages/Settings";

type Tab =
  | "dashboard"
  | "transactions"
  | "analytics"
  | "budgets"
  | "goals"
  | "forecast"
  | "tax"
  | "settings";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "analytics", label: "Analytics", icon: ChartPie },
  { id: "budgets", label: "Budgets", icon: Wallet },
  { id: "goals", label: "Goals", icon: Target },
  { id: "forecast", label: "Forecast", icon: TrendingUp },
  { id: "tax", label: "Tax", icon: ReceiptText },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const ACTIVE_PILL: CSSProperties = {
  background: "rgba(10,132,255,0.22)",
  border: "1px solid rgba(10,132,255,0.4)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
};

function SidebarContent({
  tab,
  onNavigate,
  email,
  onSignOut,
}: {
  tab: Tab;
  onNavigate: (id: Tab) => void;
  email?: string;
  onSignOut: () => void;
}) {
  return (
    <div className="glass flex h-full w-full min-w-0 flex-col gap-[18px] rounded-3xl px-4 py-5">
      {/* Brand lockup */}
      <div className="flex items-center gap-3 border-b border-white/10 px-2 pb-4 pt-1.5">
        <BrandTile />
        <div>
          <div className="text-glass text-[15px] font-semibold tracking-tight">SuperSaver</div>
          <div className="text-glass-3 text-xs tracking-wide">Save smarter</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onNavigate(t.id)}
              style={active ? ACTIVE_PILL : undefined}
              className={`flex items-center gap-[11px] rounded-[13px] px-[13px] py-[11px] text-left text-sm transition-colors ${
                active ? "font-[550] text-white" : "text-glass-2 hover:bg-white/5 hover:text-glass"
              }`}
            >
              <t.icon size={16} strokeWidth={1.75} className="w-5 shrink-0 opacity-90" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Tips + user chip, pinned to the bottom */}
      <div className="flex flex-col gap-[14px]">
        <SidebarTips />
        <div className="glass-nested flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5">
          <div
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{
              background: "rgba(10,132,255,0.35)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)",
            }}
          >
            {email?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1 text-xs leading-tight">
            <div className="text-glass truncate font-medium" title={email}>
              {email ?? "Signed in"}
            </div>
            <button onClick={onSignOut} className="text-glass-3 hover:text-glass transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [txnAccountId, setTxnAccountId] = useState<string | null>(null);
  const { user, logout } = useAuth();

  const go = (id: Tab) => {
    setTab(id);
    setNavOpen(false);
    setTxnAccountId(null); // sidebar/nav navigation clears any account filter
  };

  // Open Transactions pre-filtered to a specific account (from a dashboard tile).
  const viewAccount = (accountId: string) => {
    setTxnAccountId(accountId);
    setTab("transactions");
    setNavOpen(false);
  };

  // Show the first-login walkthrough once per account (per browser).
  const onboardKey = user ? `ss_onboarded_${user.email}` : null;
  useEffect(() => {
    if (onboardKey && !localStorage.getItem(onboardKey)) setShowOnboarding(true);
  }, [onboardKey]);

  const finishOnboarding = () => {
    if (onboardKey) localStorage.setItem(onboardKey, "1");
    setShowOnboarding(false);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Color bloom the glass refracts */}
      <div className="bloom-layer" aria-hidden>
        <div className="bloom bloom-1" />
        <div className="bloom bloom-2" />
        <div className="bloom bloom-3" />
      </div>

      <div className="relative z-[1] grid h-screen grid-cols-1 grid-rows-[auto_1fr] md:grid-cols-[248px_minmax(0,1fr)] md:grid-rows-1">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 p-4 md:hidden">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="glass flex h-10 w-10 items-center justify-center rounded-xl text-glass"
          >
            <Menu size={18} strokeWidth={1.75} />
          </button>
          <BrandTile size={32} />
          <div className="text-glass text-sm font-semibold tracking-tight">SuperSaver</div>
        </div>

        {/* Desktop sidebar (always visible ≥ md) */}
        <aside className="hidden w-[248px] shrink-0 overflow-hidden p-[18px] md:flex">
          <SidebarContent tab={tab} onNavigate={go} email={user?.email} onSignOut={logout} />
        </aside>

        {/* Mobile drawer (mounted only when open, < md) — `contents` so the
            fixed overlay never consumes a grid cell */}
        {navOpen && (
          <div className="contents md:hidden">
            <div className="fixed inset-0 z-30 bg-black/60" onClick={() => setNavOpen(false)} aria-hidden />
            <aside className="fixed inset-y-0 left-0 z-40 flex w-[248px] overflow-hidden p-[18px]">
              <SidebarContent tab={tab} onNavigate={go} email={user?.email} onSignOut={logout} />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 overflow-y-auto px-4 pb-10 pt-2 md:px-[30px] md:pl-1.5 md:pt-[26px]">
          {tab === "dashboard" && (
            <Dashboard onAddAccount={() => go("settings")} onViewAccount={viewAccount} />
          )}
          {tab === "transactions" && <Transactions initialAccountId={txnAccountId ?? undefined} />}
          {tab === "analytics" && <Analytics />}
          {tab === "budgets" && <Budgets />}
          {tab === "goals" && <Goals />}
          {tab === "forecast" && <Forecast />}
          {tab === "tax" && <Tax />}
          {tab === "settings" && <Settings />}
        </main>

        {showOnboarding && (
          <Onboarding onNavigate={(t) => go(t as Tab)} onFinish={finishOnboarding} />
        )}
      </div>
    </div>
  );
}
