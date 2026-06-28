import { useState } from "react";
import type { CSSProperties } from "react";
import { useAuth } from "./lib/AuthContext";
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

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "◧" },
  { id: "transactions", label: "Transactions", icon: "⇅" },
  { id: "analytics", label: "Analytics", icon: "◔" },
  { id: "budgets", label: "Budgets", icon: "◫" },
  { id: "goals", label: "Goals", icon: "⌖" },
  { id: "forecast", label: "Forecast", icon: "↗" },
  { id: "tax", label: "Tax", icon: "▤" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const ACTIVE_PILL: CSSProperties = {
  background: "linear-gradient(135deg, rgba(10,132,255,0.32), rgba(48,213,200,0.20))",
  border: "1px solid rgba(255,255,255,0.16)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.28), 0 6px 16px -8px rgba(10,132,255,0.6)",
};

function BrandTile({ size = 38 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size / 2.1,
        background: "linear-gradient(140deg, #0a84ff, #30d5c8)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5), 0 6px 16px -4px rgba(10,132,255,0.6)",
      }}
    >
      £
    </div>
  );
}

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
    <div className="glass flex h-full flex-col gap-[18px] rounded-3xl px-4 py-5">
      {/* Brand lockup */}
      <div className="flex items-center gap-3 border-b border-white/10 px-2 pb-4 pt-1.5">
        <BrandTile />
        <div>
          <div className="text-glass text-[15px] font-semibold tracking-tight">Finance</div>
          <div className="text-glass-3 text-xs tracking-wide">Tracker</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 overflow-y-auto">
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
              <span className="inline-flex w-5 justify-center opacity-90">{t.icon}</span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User chip */}
      <div className="glass-nested mt-auto flex items-center gap-2.5 rounded-2xl px-3 py-2.5">
        <div
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{
            background: "linear-gradient(140deg,#5e5ce6,#0a84ff)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4)",
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
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const { user, logout } = useAuth();

  const go = (id: Tab) => {
    setTab(id);
    setNavOpen(false);
  };

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Color bloom the glass refracts */}
      <div className="bloom-layer" aria-hidden>
        <div className="bloom bloom-1" />
        <div className="bloom bloom-2" />
        <div className="bloom bloom-3" />
      </div>

      <div className="relative z-[1] flex h-screen flex-col md:flex-row">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 p-4 md:hidden">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="glass flex h-10 w-10 items-center justify-center rounded-xl text-lg text-glass"
          >
            ☰
          </button>
          <BrandTile size={32} />
          <div className="text-glass text-sm font-semibold tracking-tight">Finance Tracker</div>
        </div>

        {/* Desktop sidebar (always visible ≥ md) */}
        <aside className="hidden w-[248px] shrink-0 p-[18px] md:flex">
          <SidebarContent tab={tab} onNavigate={go} email={user?.email} onSignOut={logout} />
        </aside>

        {/* Mobile drawer (mounted only when open, < md) */}
        {navOpen && (
          <div className="md:hidden">
            <div className="fixed inset-0 z-30 bg-black/60" onClick={() => setNavOpen(false)} aria-hidden />
            <aside className="fixed inset-y-0 left-0 z-40 flex w-[248px] p-[18px]">
              <SidebarContent tab={tab} onNavigate={go} email={user?.email} onSignOut={logout} />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 overflow-y-auto px-4 pb-10 pt-2 md:px-[30px] md:pl-1.5 md:pt-[26px]">
          {tab === "dashboard" && <Dashboard />}
          {tab === "transactions" && <Transactions />}
          {tab === "analytics" && <Analytics />}
          {tab === "budgets" && <Budgets />}
          {tab === "goals" && <Goals />}
          {tab === "forecast" && <Forecast />}
          {tab === "tax" && <Tax />}
          {tab === "settings" && <Settings />}
        </main>
      </div>
    </div>
  );
}
