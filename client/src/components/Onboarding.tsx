import { useEffect, useState } from "react";
import { Button } from "./ui";
import { BrandTile } from "./BrandMark";

type TourStep = { tab: string; target?: string; title: string; body: string };

const STEPS: TourStep[] = [
  {
    tab: "dashboard",
    title: "Welcome to SuperSaver",
    body: "Let's take a quick, interactive tour — I'll walk you through the app and show you exactly where to add your first account.",
  },
  {
    tab: "settings",
    target: "add-account",
    title: "Add your accounts",
    body: "This is the account form in Settings. Fill it in and press “Add Account” to add a current, savings, ISA or pension account — its balance and interest then flow through the whole app.",
  },
  {
    tab: "transactions",
    target: "add-transaction",
    title: "Log your money",
    body: "On Transactions, use “+ Add Transaction” to record income and expenses — or import a bank CSV, split a purchase across categories, and attach receipts.",
  },
  {
    tab: "budgets",
    target: "add-budget",
    title: "Set budgets",
    body: "Give a category a monthly limit here. Your sidebar tips will then keep you posted on how close you are to each budget.",
  },
  {
    tab: "forecast",
    title: "Forecast & tax",
    body: "Forecast projects your savings with a Monte Carlo simulation and shows your ISA allowance and the figures you need for a UK tax return.",
  },
  {
    tab: "dashboard",
    title: "You're all set!",
    body: "That's the tour. Add your accounts whenever you're ready — your dashboard and the sidebar tips will start filling in automatically.",
  },
];

/** An interactive first-login tour: navigates to each module and spotlights the
 *  real action element there. Non-blocking, so you can try things as you go. */
export function Onboarding({
  onNavigate,
  onFinish,
}: {
  onNavigate: (tab: string) => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const s = STEPS[step];
  const first = step === 0;
  const last = step === STEPS.length - 1;

  // Switch to this step's module.
  useEffect(() => {
    onNavigate(s.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Locate + track the highlighted element. The target may render/scroll in
  // asynchronously (data fetch), so poll until it appears, scroll it into view
  // once, then keep its position synced.
  useEffect(() => {
    if (!s.target) {
      setRect(null);
      return;
    }
    const sel = `[data-tour="${s.target}"]`;
    let scrolled = false;
    const centreInScroller = (el: HTMLElement) => {
      const scroller = el.closest("main");
      if (!scroller) {
        el.scrollIntoView({ block: "center" });
        return;
      }
      const er = el.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      const delta = er.top - sr.top - (scroller.clientHeight / 2 - er.height / 2);
      scroller.scrollTop += delta; // direct assignment is reliable everywhere
    };
    const tick = () => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) {
        setRect(null);
        return;
      }
      if (!scrolled) {
        centreInScroller(el);
        scrolled = true;
      }
      setRect(el.getBoundingClientRect());
    };
    const t = setTimeout(tick, 50);
    const id = setInterval(tick, 200);
    window.addEventListener("resize", tick);
    window.addEventListener("scroll", tick, true);
    return () => {
      clearTimeout(t);
      clearInterval(id);
      window.removeEventListener("resize", tick);
      window.removeEventListener("scroll", tick, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const pad = 8;
  return (
    <>
      {/* Dim + spotlight (spotlight lets clicks through to the real element) */}
      {rect ? (
        <div
          className="pointer-events-none fixed z-[59] rounded-xl transition-[top,left,width,height] duration-300"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(2,6,23,0.74)",
            outline: "2px solid rgba(100,210,255,0.9)",
            outlineOffset: 2,
          }}
        />
      ) : (
        <div className="fixed inset-0 z-[59] bg-black/70" />
      )}

      {/* Instruction card */}
      <div
        className={`fixed z-[61] w-[340px] max-w-[calc(100vw-2rem)] ${
          rect ? "bottom-6 right-6" : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
      >
        <div className="glass relative rounded-panel p-5">
          <button
            onClick={onFinish}
            className="text-glass-3 hover:text-glass absolute right-4 top-4 text-[13px]"
            aria-label="Skip tour"
          >
            Skip ✕
          </button>

          {first && <BrandTile size={40} />}
          <h2 className={`text-glass ${first ? "mt-3" : ""} pr-10 text-[18px] font-semibold tracking-tight`}>
            {s.title}
          </h2>
          <p className="text-glass-2 mt-2 text-[13.5px] leading-relaxed">{s.body}</p>

          <div className="mt-4 flex justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-5 bg-[#64d2ff]" : "w-1.5 bg-white/20"
                }`}
              />
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <Button onClick={() => (first ? onFinish() : setStep(step - 1))}>
              {first ? "Skip" : "Back"}
            </Button>
            {last ? (
              <Button variant="primary" onClick={onFinish}>
                Finish
              </Button>
            ) : (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
