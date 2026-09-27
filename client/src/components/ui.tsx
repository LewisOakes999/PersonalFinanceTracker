import type { ButtonHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X, ChevronDown } from "lucide-react";

/** Small account-type badge (ISA / PB / PEN / INV). One neutral style for all —
 *  the badge is metadata, not a status, so it doesn't earn a colour. */
function AccountBadge({ children }: { children: string }) {
  return (
    <span className="rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-glass-2">
      {children}
    </span>
  );
}

export const IsaBadge = () => <AccountBadge>ISA</AccountBadge>;
export const PbBadge = () => <AccountBadge>PB</AccountBadge>;
export const PensionBadge = () => <AccountBadge>PEN</AccountBadge>;
export const InvestmentBadge = () => <AccountBadge>INV</AccountBadge>;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A frosted "Liquid Glass" panel. Pass `nested` for the lighter inner surface. */
export function Tile({
  children,
  className = "",
  nested = false,
  rounded = "rounded-panel",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  nested?: boolean;
  rounded?: string;
  onClick?: () => void;
}) {
  const interactive = onClick
    ? {
        role: "button",
        tabIndex: 0,
        onClick,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};
  return (
    <div
      className={`${nested ? "glass-nested" : "glass"} ${rounded} ${
        onClick ? "cursor-pointer" : ""
      } ${className}`}
      {...interactive}
    >
      {children}
    </div>
  );
}

const TONES: Record<string, string> = {
  default: "var(--lg-text)",
  income: "#34e0c4",
  expense: "#ff6b8a",
  accent: "#64d2ff",
};

/** A summary stat tile: quiet label, loud number. The value colour is the
 *  only tonal signal — no decorative icon or glow. */
export function StatTile({
  label,
  value,
  tone = "default",
  sub,
}: {
  label: string;
  value: string;
  tone?: "default" | "income" | "expense" | "accent";
  sub?: string;
}) {
  return (
    <Tile rounded="rounded-glass" className="p-5">
      <div className="text-glass-3 text-[11px] font-medium uppercase tracking-[0.08em]">
        {label}
      </div>
      <div
        className="num mt-3 whitespace-nowrap text-[28px] font-semibold leading-none tracking-tight"
        style={{ color: TONES[tone] }}
      >
        {value}
      </div>
      {sub && <div className="text-glass-3 mt-2 text-xs">{sub}</div>}
    </Tile>
  );
}

export function Button({
  variant = "default",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger" | "ghost";
}) {
  const base =
    "rounded-xl px-3.5 py-2 text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    default:
      "border-white/10 bg-white/5 text-glass hover:bg-white/10 hover:border-white/20",
    primary:
      "border-[rgba(10,132,255,0.5)] bg-[rgba(10,132,255,0.18)] text-white hover:bg-[rgba(10,132,255,0.28)]",
    danger:
      "border-[rgba(255,107,138,0.45)] bg-[rgba(255,107,138,0.14)] text-[#ff9bae] hover:bg-[rgba(255,107,138,0.22)]",
    ghost: "border-transparent bg-transparent text-glass-3 hover:text-glass",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

/** Month + year selectors (two separate boxes). Value/onChange use YYYY-MM. */
export function MonthSelector({
  value,
  onChange,
  yearsBack = 5,
}: {
  value: string;
  onChange: (month: string) => void;
  yearsBack?: number;
}) {
  const [year, month] = value.split("-").map(Number);

  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - yearsBack; y--) years.push(y);
  // Keep the selected year visible even if it falls outside the default window.
  if (!years.includes(year)) {
    years.push(year);
    years.sort((a, b) => b - a);
  }

  const emit = (y: number, m: number) => onChange(`${y}-${String(m).padStart(2, "0")}`);

  return (
    <div className="glass flex gap-1 rounded-2xl p-1.5">
      <select
        aria-label="Month"
        value={month}
        onChange={(e) => emit(year, Number(e.target.value))}
        className="num min-w-[8rem] border-none bg-transparent px-2 py-1 backdrop-blur-none"
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
      <select
        aria-label="Year"
        value={year}
        onChange={(e) => emit(Number(e.target.value), month)}
        className="num border-none bg-transparent px-2 py-1 backdrop-blur-none"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A centred modal on a frosted glass panel. Pass `onBack` when the modal is
 *  showing a sub-view, so there's a one-click way out of it that isn't Close.
 *  Rendered into <body>: a glass panel's backdrop-filter would otherwise trap
 *  the fixed overlay inside that panel, letting later panels paint over it. */
export function Modal({
  title,
  onClose,
  onBack,
  children,
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-lg rounded-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {onBack && (
              <button
                onClick={onBack}
                className="text-glass-3 hover:text-glass -ml-1 shrink-0"
                aria-label="Back"
                title="Back"
              >
                <ArrowLeft size={16} strokeWidth={2} />
              </button>
            )}
            <h2 className="text-glass truncate text-sm font-semibold uppercase tracking-wider">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-glass-3 hover:text-glass shrink-0"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-glass-2 mb-4 text-[13px] font-semibold uppercase tracking-[0.06em]">
      {children}
    </h2>
  );
}

/** A glass panel whose body collapses/expands when its title header is clicked. */
export function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass rounded-panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-panel px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
          {title}
        </span>
        <ChevronDown
          size={16}
          className={`text-glass-3 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Inline field label + control wrapper. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-glass-3 mb-1 block text-xs uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}
