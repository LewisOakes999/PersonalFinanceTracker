import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Small tax-free "ISA" badge. */
export function IsaBadge() {
  return (
    <span className="rounded-md border border-[#34e0c4]/40 bg-[#34e0c4]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#34e0c4]">
      ISA
    </span>
  );
}

/** Small tax-free "Premium Bonds" badge. */
export function PbBadge() {
  return (
    <span className="rounded-md border border-[#bf5af2]/40 bg-[#bf5af2]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#bf5af2]">
      PB
    </span>
  );
}

/** Small "PEN" badge for pension accounts. */
export function PensionBadge() {
  return (
    <span className="rounded-md border border-[#30d5c8]/40 bg-[#30d5c8]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#30d5c8]">
      PEN
    </span>
  );
}

/** Small "INV" badge for variable-return investment accounts. */
export function InvestmentBadge() {
  return (
    <span className="rounded-md border border-[#7d7aff]/40 bg-[#7d7aff]/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#7d7aff]">
      INV
    </span>
  );
}

/** Decorative background colour-bloom the frosted glass refracts. */
export function Bloom() {
  return (
    <div className="bloom-layer" aria-hidden>
      <div className="bloom bloom-1" />
      <div className="bloom bloom-2" />
      <div className="bloom bloom-3" />
    </div>
  );
}

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
}: {
  children: ReactNode;
  className?: string;
  nested?: boolean;
  rounded?: string;
}) {
  return (
    <div className={`${nested ? "glass-nested" : "glass"} ${rounded} ${className}`}>
      {children}
    </div>
  );
}

const TONES: Record<string, { color: string; glow?: string }> = {
  default: { color: "var(--lg-text)" },
  income: { color: "#34e0c4", glow: "rgba(52,224,196,0.55)" },
  expense: { color: "#ff6b8a", glow: "rgba(255,107,138,0.5)" },
  accent: { color: "#64d2ff", glow: "rgba(100,210,255,0.5)" },
};

/** A summary stat tile with a soft corner glow blob. */
export function StatTile({
  label,
  value,
  tone = "default",
  sub,
  icon,
}: {
  label: string;
  value: string;
  tone?: "default" | "income" | "expense" | "accent";
  sub?: string;
  icon?: ReactNode;
}) {
  const { color, glow } = TONES[tone];
  return (
    <Tile rounded="rounded-glass" className="relative overflow-hidden p-5">
      {glow && (
        <div
          className="pointer-events-none absolute -right-5 -top-5 h-[90px] w-[90px] rounded-full"
          style={{ background: glow, filter: "blur(36px)", opacity: 0.5 }}
        />
      )}
      <div className="text-glass-3 relative flex items-center gap-2 text-xs uppercase tracking-[0.08em]">
        {icon && <span aria-hidden>{icon}</span>}
        <span>{label}</span>
      </div>
      <div
        className="num relative mt-3 whitespace-nowrap text-[26px] font-semibold tracking-tight"
        style={{ color }}
      >
        {value}
      </div>
      {sub && <div className="text-glass-3 mt-1 text-xs">{sub}</div>}
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

/** A centred modal on a frosted glass panel. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-lg rounded-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <h2 className="text-glass text-sm font-semibold uppercase tracking-wider">{title}</h2>
          <button
            onClick={onClose}
            className="text-glass-3 hover:text-glass"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-glass-2 mb-4 text-[13px] font-semibold uppercase tracking-[0.06em]">
      {children}
    </h2>
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
