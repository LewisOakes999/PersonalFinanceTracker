import { checkPassword, passwordStrength, type StrengthLevel } from "../lib/password";

const META: Record<StrengthLevel, { label: string; color: string; bars: number }> = {
  weak: { label: "Weak", color: "#ff6b8a", bars: 1 },
  moderate: { label: "Moderate", color: "#ffd60a", bars: 2 },
  strong: { label: "Strong", color: "#34e0c4", bars: 3 },
};

function Req({ ok, children }: { ok: boolean; children: string }) {
  return (
    <span style={{ color: ok ? "#34e0c4" : undefined }} className={ok ? "" : "text-glass-3"}>
      {ok ? "✓" : "○"} {children}
    </span>
  );
}

/** A 3-segment strength meter (Weak / Moderate / Strong) plus the requirements. */
export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const level = passwordStrength(password);
  const { label, color, bars } = META[level];
  const c = checkPassword(password);

  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-nested h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: i < bars ? "100%" : "0%", background: color }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <span style={{ color }}>{label}</span>
        <span className="flex gap-2">
          <Req ok={c.minLength}>8+</Req>
          <Req ok={c.hasUpper}>uppercase</Req>
          <Req ok={c.hasSymbol}>symbol</Req>
        </span>
      </div>
    </div>
  );
}
