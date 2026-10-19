import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  ArrowLeftRight,
  CalendarCheck,
  ChartCandlestick,
  ChartPie,
  ChevronDown,
  Coins,
  Dumbbell,
  Flag,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Route,
  Scale,
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
import { AUTHOR, REPO_URL } from "./lib/site";
import { GithubIcon } from "./components/GithubIcon";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import Analytics from "./pages/Analytics";
import Budgets from "./pages/Budgets";
import Goals from "./pages/Goals";
import Investments from "./pages/Investments";
import Fitness, { type FitnessView } from "./pages/Fitness";
import Forecast from "./pages/Forecast";
import Tax from "./pages/Tax";
import Settings from "./pages/Settings";

type Tab =
  | "dashboard"
  | "transactions"
  | "analytics"
  | "budgets"
  | "goals"
  | "investments"
  | "forecast"
  | "tax"
  | "fitness"
  | "strength"
  | "cardio"
  | "weight"
  | "fitnessGoals"
  | "kit"
  | "settings";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: ArrowLeftRight },
  { id: "analytics", label: "Analytics", icon: ChartPie },
  { id: "budgets", label: "Budgets", icon: Wallet },
  { id: "goals", label: "Goals", icon: Target },
  { id: "investments", label: "Investments", icon: ChartCandlestick },
  { id: "forecast", label: "Forecast", icon: TrendingUp },
  { id: "tax", label: "Tax", icon: ReceiptText },
  { id: "fitness", label: "Overview", icon: CalendarCheck },
  { id: "strength", label: "Strength", icon: Dumbbell },
  { id: "cardio", label: "Cardio", icon: Route },
  { id: "weight", label: "Body weight", icon: Scale },
  { id: "fitnessGoals", label: "Goals", icon: Flag },
  { id: "kit", label: "Kit & costs", icon: Coins },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

// The sidebar groups pages by area of life; unlabelled groups sit apart.
const NAV_SECTIONS: { label?: string; tabs: Tab[] }[] = [
  {
    label: "Money",
    tabs: ["dashboard", "transactions", "analytics", "budgets", "goals", "investments", "forecast", "tax"],
  },
  { label: "Health", tabs: ["fitness", "strength", "cardio", "weight", "fitnessGoals", "kit"] },
  { tabs: ["settings"] },
];

/** The Fitness view each Health page shows. */
const FITNESS_VIEWS: Partial<Record<Tab, FitnessView>> = {
  fitness: "overview",
  strength: "strength",
  cardio: "cardio",
  weight: "weight",
  fitnessGoals: "goals",
  kit: "kit",
};
const tabForView = (v: FitnessView) =>
  (Object.keys(FITNESS_VIEWS) as Tab[]).find((t) => FITNESS_VIEWS[t] === v) ?? "fitness";

/** The area a page belongs to, which sets its accent colour (Health is green). */
const areaOf = (tab: Tab) =>
  NAV_SECTIONS.find((s) => s.tabs.includes(tab))?.label === "Health" ? "health" : "money";

// Which labelled sections are folded away — a per-device preference, so it
// lives in this browser. Storage can be unavailable (private mode), hence the guards.
const NAV_COLLAPSED_KEY = "ss_nav_collapsed";
function readCollapsed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(NAV_COLLAPSED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const ACTIVE_PILL: CSSProperties = {
  background: "rgb(var(--accent-rgb) / 0.22)",
  border: "1px solid rgb(var(--accent-rgb) / 0.4)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
};

function SidebarContent({
  tab,
  onNavigate,
  email,
  onSignOut,
  collapsed,
  onToggleSection,
}: {
  tab: Tab;
  onNavigate: (id: Tab) => void;
  email?: string;
  onSignOut: () => void;
  collapsed: string[];
  onToggleSection: (label: string) => void;
}) {
  // The tips card gives way when the nav would otherwise have to scroll, and
  // comes back once there's room again — e.g. after folding a section.
  const navRef = useRef<HTMLElement>(null);
  const tipsRef = useRef<HTMLDivElement>(null);
  const tipsSpace = useRef(180); // last measured height of the tips card, plus its gap
  const [showTips, setShowTips] = useState(true);
  useLayoutEffect(() => {
    const fit = () => {
      const nav = navRef.current;
      const first = nav?.firstElementChild;
      const last = nav?.lastElementChild;
      if (!nav || !first || !last) return;
      if (tipsRef.current && tipsRef.current.offsetHeight > 0) {
        tipsSpace.current = tipsRef.current.offsetHeight + 14;
      }
      const content = last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
      const spare = nav.clientHeight - content;
      // Hide as soon as it doesn't fit; only return when the whole card would.
      // The gap between the two thresholds stops it flickering.
      setShowTips((shown) => (shown ? spare >= 0 : spare >= tipsSpace.current));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [collapsed, tab, showTips]);

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
      <nav ref={navRef} className="flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto">
        {NAV_SECTIONS.map((section, si) => {
          const folded = !!section.label && collapsed.includes(section.label);
          // A folded section still shows the page you're on, so you never lose your place.
          const shown = folded ? section.tabs.filter((id) => id === tab) : section.tabs;
          return (
            <div
              key={section.label ?? section.tabs[0]}
              className={`flex flex-col gap-1 ${si > 0 ? (section.label ? "mt-1.5" : "mt-1.5 border-t border-white/10 pt-1.5") : ""}`}
            >
              {section.label && (
                <button
                  type="button"
                  onClick={() => onToggleSection(section.label!)}
                  aria-expanded={!folded}
                  title={folded ? `Show ${section.label}` : `Hide ${section.label}`}
                  className="text-glass-3 hover:text-glass flex items-center gap-1.5 rounded-md px-[13px] py-0.5 text-left text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors"
                >
                  <span>{section.label}</span>
                  {folded && (
                    <span className="num font-normal normal-case tracking-normal">· {section.tabs.length}</span>
                  )}
                  <ChevronDown
                    size={12}
                    strokeWidth={2.25}
                    className={`ml-auto transition-transform duration-200 ${folded ? "-rotate-90" : ""}`}
                  />
                </button>
              )}
              {shown.map((id) => {
                const t = TABS.find((x) => x.id === id)!;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onNavigate(t.id)}
                    style={active ? ACTIVE_PILL : undefined}
                    className={`flex items-center gap-[11px] rounded-[13px] px-[13px] py-[9px] text-left text-sm transition-colors ${
                      active ? "font-[550] text-white" : "text-glass-2 hover:bg-white/5 hover:text-glass"
                    }`}
                  >
                    <t.icon size={16} strokeWidth={1.75} className="w-5 shrink-0 opacity-90" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Tips + user chip, pinned to the bottom */}
      <div className="flex flex-col gap-[14px]">
        {/* Gives way when the nav needs the room, so every page stays reachable. */}
        <div ref={tipsRef} className={showTips ? "" : "hidden"}>
          <SidebarTips />
        </div>
        <div className="glass-nested flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2.5">
          <div
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{
              background: "rgb(var(--accent-rgb) / 0.35)",
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
        {/* Credit — sits in the sidebar so it shows on every module. */}
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-glass-3 hover:text-glass flex items-center justify-center gap-1.5 text-[11px] transition-colors"
          title="View the source on GitHub"
        >
          <GithubIcon size={11} />
          Built by {AUTHOR}
        </a>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState<string[]>(readCollapsed);
  const toggleNavSection = (label: string) =>
    setNavCollapsed((current) => {
      const next = current.includes(label) ? current.filter((x) => x !== label) : [...current, label];
      try {
        localStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* not remembered this time — the toggle still works */
      }
      return next;
    });
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Set on <html> rather than the page, so pop-ups (rendered into <body>) follow it.
  const area = areaOf(tab);
  useEffect(() => {
    document.documentElement.dataset.area = area;
  }, [area]);
  const [txnAccountId, setTxnAccountId] = useState<string | null>(null);
  const [settingsFocus, setSettingsFocus] = useState<string | null>(null);
  const [settingsAccountId, setSettingsAccountId] = useState<string | null>(null);
  const { user, logout } = useAuth();

  const go = (id: Tab) => {
    setTab(id);
    setNavOpen(false);
    setTxnAccountId(null); // sidebar/nav navigation clears any account filter
    setSettingsFocus(null);
    setSettingsAccountId(null);
  };

  // Open Transactions pre-filtered to a specific account (from a dashboard tile).
  const viewAccount = (accountId: string) => {
    setTxnAccountId(accountId);
    setTab("transactions");
    setNavOpen(false);
  };

  // Open Settings with a specific section expanded (from dashboard shortcuts).
  const manage = (section: string) => {
    setSettingsFocus(section);
    setSettingsAccountId(null);
    setTab("settings");
    setNavOpen(false);
  };

  // Open Settings on one account, ready to edit (from its dashboard cog).
  const editAccount = (accountId: string) => {
    setSettingsFocus("accounts");
    setSettingsAccountId(accountId);
    setTab("settings");
    setNavOpen(false);
  };

  const replayTour = () => {
    if (onboardKey) localStorage.removeItem(onboardKey);
    setShowOnboarding(true);
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
          <SidebarContent
            tab={tab}
            onNavigate={go}
            email={user?.email}
            onSignOut={logout}
            collapsed={navCollapsed}
            onToggleSection={toggleNavSection}
          />
        </aside>

        {/* Mobile drawer (mounted only when open, < md) — `contents` so the
            fixed overlay never consumes a grid cell */}
        {navOpen && (
          <div className="contents md:hidden">
            <div className="fixed inset-0 z-30 bg-black/60" onClick={() => setNavOpen(false)} aria-hidden />
            <aside className="fixed inset-y-0 left-0 z-40 flex w-[248px] overflow-hidden p-[18px]">
              <SidebarContent
                tab={tab}
                onNavigate={go}
                email={user?.email}
                onSignOut={logout}
                collapsed={navCollapsed}
                onToggleSection={toggleNavSection}
              />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 overflow-y-auto px-4 pb-10 pt-2 md:px-[30px] md:pl-1.5 md:pt-[26px]">
          {tab === "dashboard" && (
            <Dashboard
              onManage={manage}
              onGoTo={(t) => go(t as Tab)}
              onViewAccount={viewAccount}
              onEditAccount={editAccount}
            />
          )}
          {tab === "transactions" && <Transactions initialAccountId={txnAccountId ?? undefined} />}
          {tab === "analytics" && <Analytics onGoTo={(t) => go(t as Tab)} />}
          {tab === "budgets" && <Budgets />}
          {tab === "goals" && <Goals />}
          {tab === "investments" && <Investments onManageAccounts={() => manage("accounts")} />}
          {tab === "forecast" && <Forecast />}
          {tab === "tax" && <Tax />}
          {/* One Fitness page for all its views, so moving between them keeps its data. */}
          {FITNESS_VIEWS[tab] && <Fitness view={FITNESS_VIEWS[tab]} onView={(v) => go(tabForView(v))} />}
          {tab === "settings" && (
            <Settings
              focusSection={settingsFocus}
              focusAccountId={settingsAccountId}
              onReplayTour={replayTour}
            />
          )}
        </main>

        {showOnboarding && (
          <Onboarding onNavigate={(t) => go(t as Tab)} onFinish={finishOnboarding} />
        )}
      </div>
    </div>
  );
}
