import { useState } from "react";
import { Button } from "./ui";
import { BrandTile } from "./BrandMark";

type Step = { icon: string; title: string; body: string };

const STEPS: Step[] = [
  {
    icon: "",
    title: "Welcome to SuperSaver",
    body: "Your accounts, budgets, goals, forecasts and UK tax figures — all in one private place. Here's a 30-second tour.",
  },
  {
    icon: "🏦",
    title: "Add your accounts",
    body: "Go to Settings → Accounts to add your current, savings, ISA, pension and Premium Bond accounts. Their balances and interest rates flow through the whole app.",
  },
  {
    icon: "⇅",
    title: "Log your money",
    body: "On Transactions you can add income and expenses, import a bank CSV, split a purchase across categories, and attach receipts.",
  },
  {
    icon: "◫",
    title: "Budgets & goals",
    body: "Set a monthly budget per category and savings goals. The tips panel in the sidebar keeps you posted on how you're tracking.",
  },
  {
    icon: "↗",
    title: "Forecast & tax",
    body: "See a Monte Carlo forecast of your savings, how much ISA allowance you've used, and the figures you need for a UK tax return.",
  },
];

/** A skippable first-login walkthrough. */
export function Onboarding({
  onClose,
  onAddAccount,
}: {
  onClose: () => void;
  onAddAccount: () => void;
}) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass relative w-full max-w-md rounded-panel p-6">
        <button
          onClick={onClose}
          className="text-glass-3 hover:text-glass absolute right-4 top-4 text-[13px]"
          aria-label="Skip tour"
        >
          Skip ✕
        </button>

        <div className="flex flex-col items-center text-center">
          {step === 0 ? (
            <BrandTile size={56} />
          ) : (
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-[26px] text-[#64d2ff]"
              style={{ background: "rgba(100,210,255,0.12)" }}
            >
              {s.icon}
            </div>
          )}
          <h2 className="text-glass mt-4 text-[20px] font-semibold tracking-tight">{s.title}</h2>
          <p className="text-glass-2 mt-2 text-[14px] leading-relaxed">{s.body}</p>
        </div>

        <div className="mt-6 flex justify-center gap-1.5">
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === step ? "w-5 bg-[#64d2ff]" : "w-1.5 bg-white/20"
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button onClick={() => (step === 0 ? onClose() : setStep(step - 1))}>
            {step === 0 ? "Skip tour" : "Back"}
          </Button>
          {last ? (
            <Button variant="primary" onClick={onAddAccount}>
              Add your first account →
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
