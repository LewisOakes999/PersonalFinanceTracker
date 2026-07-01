// The SuperSaver brand: a piggy-bank mark (the universal savings symbol) on the
// app's signature blue→teal glass tile. Defined once here and used everywhere
// (sidebar, mobile bar, auth screen, landing page) so the brand stays uniform.

const TILE_BG = "linear-gradient(140deg, #0a84ff, #30d5c8)";
const TILE_SHADOW =
  "inset 0 1px 0 rgba(255,255,255,0.5), 0 6px 16px -4px rgba(10,132,255,0.6)";
// Darker tone for the pig's "cut-out" details so they read over the gradient.
const DETAIL = "#0a5bd0";

/** The piggy-bank glyph on its own (transparent background). */
export function BrandMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role="img"
      aria-label="SuperSaver"
    >
      {/* coin dropping into the slot */}
      <circle cx="12.2" cy="4.6" r="1.95" fill="white" />
      <circle cx="12.2" cy="4.6" r="0.7" fill={DETAIL} opacity="0.55" />
      {/* ear */}
      <path d="M8.2 8 L10.7 5 Q11 4.7 11.1 5.1 L11.5 8.4 Z" fill="white" />
      {/* body */}
      <ellipse cx="12.6" cy="13" rx="7.5" ry="5.9" fill="white" />
      {/* snout */}
      <ellipse cx="4.5" cy="13.3" rx="2.4" ry="2.8" fill="white" />
      {/* legs */}
      <rect x="7.2" y="17.6" width="2.5" height="2.7" rx="1" fill="white" />
      <rect x="14.4" y="17.6" width="2.5" height="2.7" rx="1" fill="white" />
      {/* coin slot */}
      <rect x="10.2" y="8.2" width="4.7" height="1.05" rx="0.52" fill={DETAIL} />
      {/* eye */}
      <circle cx="8.1" cy="11.6" r="0.78" fill={DETAIL} />
      {/* nostrils */}
      <circle cx="4.1" cy="12.5" r="0.5" fill={DETAIL} />
      <circle cx="4.1" cy="14.1" r="0.5" fill={DETAIL} />
    </svg>
  );
}

/** The piggy-bank mark inside the signature rounded glass tile. */
export function BrandTile({ size = 38 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: TILE_BG, boxShadow: TILE_SHADOW }}
    >
      <BrandMark size={Math.round(size * 0.62)} />
    </div>
  );
}
