# Handoff: Liquid Glass Dashboard Reskin (Dark)

## Overview
A visual reskin of the Personal Finance Tracker **Dashboard** from its current flat,
square, slate theme into an Apple **"Liquid Glass"** aesthetic — translucent frosted
panels floating over a deep near-black backdrop with a soft, slow-drifting color bloom
that refracts through the glass. Dark mode is preserved. Only the **Dashboard** screen is
covered here; the other tabs (Transactions, Analytics, Budgets, Settings) are not yet
reskinned but should follow the same system.

## About the Design Files
The file in this bundle (`Dashboard.dc.html`) is a **design reference created in HTML** —
a prototype showing the intended look and behavior, **not production code to copy
directly**. It is a self-contained streaming "Design Component" with all styling inline.

The task is to **recreate this design inside the existing codebase**
(`PersonalFinanceTracker/client` — Vite + React + TypeScript + Tailwind CSS) using its
established structure (`src/pages/Dashboard.tsx`, the shared primitives in
`src/components/ui.tsx`, the `recharts` chart library, the currency context, and the
typed API client). Do **not** ship the HTML directly — translate it into the React
components and Tailwind utilities already in use.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, radii, and treatments are
specified below with exact values. Recreate pixel-faithfully using the codebase's
existing libraries and patterns.

## Key shift from the current design
The current app is deliberately **flat, square (border-radius forced to 0 globally in
`tailwind.config.js`), 1px slate borders**. Liquid Glass reverses several of those rules
for this screen:
- **Rounded corners are now required.** The global `borderRadius` override to `0` in
  `tailwind.config.js` must be removed (or this screen must opt out) so radii of
  `13–24px` can be applied.
- **Borders become translucent white** (`rgba(255,255,255,0.10)`) instead of solid slate.
- **Panels become translucent** with `backdrop-filter: blur()` instead of solid
  `bg-slate-800`. This requires the panel to sit above a colorful, blurred background or
  the frost effect is invisible.
- **Accent palette shifts** from emerald/rose/sky to a cooler blue/teal set (below).

---

## Screen: Dashboard

### Purpose
At-a-glance monthly money overview: summary stats, spending breakdown, recent activity,
and per-account balances.

### Layout
- Full-height **two-column** app shell: fixed-width left **sidebar** + fluid **main**.
  - Root: `position:relative; min-height:100vh; overflow:hidden;` dark background
    `#08080b`, white text `#f5f5f7`, SF Pro font stack.
  - **Background bloom layer** (`z-index:0`, `pointer-events:none`): three large blurred
    radial-gradient circles (accent blue, teal `#30d5c8`, indigo `#5e5ce6`),
    `filter: blur(90–110px)`, each slowly drifting (see Animations). This is what the
    glass refracts.
  - **Content layer** (`z-index:1`): `display:flex`.

- **Sidebar** — `width:248px; flex-shrink:0; padding:18px`. Contains one tall glass panel
  (`border-radius:24px`) holding: brand lockup (gradient "£" tile + "Finance / Tracker"),
  nav list, and a user chip pinned to the bottom (`margin-top:auto`).

- **Main** — `flex:1; padding:26px 30px 40px 6px`. Stacks:
  1. **Header** row: title block (left) + glass month switcher pill (right).
  2. **Summary grid**: `display:grid; grid-template-columns:repeat(auto-fit, minmax(196px, 1fr)); gap:16px`.
     Four stat tiles. (auto-fit prevents number clipping at narrow widths.)
  3. **Two-up grid**: `grid-template-columns:1fr 1fr; gap:16px` — Spending donut (left),
     Recent transactions (right).
  4. **Balances** panel: full width, inner `grid-template-columns:repeat(3,1fr); gap:14px`.

### The glass panel recipe (reuse everywhere)
Every primary panel uses this exact treatment — make it a reusable component/util:
```
background: rgba(255,255,255,0.055);          /* the "glass" token */
backdrop-filter: blur(34px) saturate(180%);   /* + -webkit- prefix */
border: 1px solid rgba(255,255,255,0.10);
border-radius: 20–24px;
box-shadow:
  inset 0 1px 0 0 rgba(255,255,255,0.18),     /* top edge specular highlight */
  0 14px 34px -16px rgba(0,0,0,0.6);          /* depth drop shadow */
```
Nested/secondary surfaces (account cards, user chip) use a lighter fill
`rgba(255,255,255,0.04)`, border `rgba(255,255,255,0.08)`, radius `14–16px`, and only the
inset highlight.

### Components

**Brand tile** — 38×38, `border-radius:12px`,
`background:linear-gradient(140deg, #0a84ff, #30d5c8)`, white "£" 18px/700, inset white
highlight + blue glow shadow.

**Nav items** — vertical list, `gap:4px`. Each: `padding:11px 13px; border-radius:13px;
font-size:14px`, icon (20px slot) + label.
- *Active* (Dashboard): `font-weight:550; color:#fff;`
  `background:linear-gradient(135deg, rgba(10,132,255,0.32), rgba(48,213,200,0.20));`
  `border:1px solid rgba(255,255,255,0.16);`
  `box-shadow:inset 0 1px 0 rgba(255,255,255,0.28), 0 6px 16px -8px rgba(10,132,255,0.6);`
- *Inactive*: `font-weight:450; color:rgba(245,245,247,0.62);` hover → lighter bg + brighter text.
- Order/icons: Dashboard ◧, Transactions ⇅, Analytics ◔, Budgets ◫, Settings ⚙.

**Month switcher** — glass pill (`padding:6px; border-radius:14px`) containing `‹`
button, centered `June 2026` label (`14px/500; tabular-nums; min-width:104px`), `›`
button. Buttons 30×30, `border-radius:9px`, transparent → `rgba(255,255,255,0.08)` on hover.

**Stat tiles** (×4) — glass panel, `padding:20px; border-radius:20px; overflow:hidden`.
- Corner **glow blob**: absolutely positioned, `top:-20px; right:-20px; 90×90;
  border-radius:50%; filter:blur(36px); opacity:0.5`, color per tile.
- Label row (`position:relative` so it sits above the blob): icon + UPPERCASE label,
  `12px; letter-spacing:0.08em; color:rgba(245,245,247,0.5)`.
- Value (`position:relative; white-space:nowrap`): `26px; font-weight:650;
  letter-spacing:-0.02em; font-variant-numeric:tabular-nums`, color per tile.
- Sub label: `12px; color:rgba(245,245,247,0.45)`.
- The four tiles:
  | Tile | Value (sample) | Sub | Color | Glow |
  |---|---|---|---|---|
  | Income ↑ | £4,200.00 | this month | `#34e0c4` | `rgba(52,224,196,0.55)` |
  | Expenses ↓ | £2,847.50 | this month | `#ff6b8a` | `rgba(255,107,138,0.5)` |
  | Net ≈ | +£1,352.50 | income − expenses | `#34e0c4` (≥0) / `#ff6b8a` (<0) | `rgba(52,224,196,0.45)` |
  | Balance ◈ | £18,432.10 | 3 accounts | `#64d2ff` | `rgba(100,210,255,0.5)` |

**Spending by Category** panel — glass, `padding:22px; border-radius:22px`. Section title
`13px/600 UPPERCASE; letter-spacing:0.06em; color:rgba(245,245,247,0.6)`. Body is a flex
row (`gap:20px`):
- **Donut** (172×172, `flex-shrink:0`): SVG `viewBox 0 0 200 200`, a `<g transform="rotate(-90 100 100)">`
  with a track circle (`r:78; stroke:rgba(255,255,255,0.06); stroke-width:24`) and one
  stroked arc circle per category. Arc length = `(total/grandTotal) × (2π·78)`, with a
  `2px` gap subtracted from each segment's dash and `stroke-dashoffset` accumulating.
  Centered overlay: "SPENT" caption + total `£2,847.50` (`21px/650; tabular-nums`).
  *In the React app, this is already a `recharts` `<PieChart>` with `innerRadius`/`outerRadius`
  — keep recharts; just restyle: cool category colors, a dark/transparent stroke between
  slices, and an added centered total label.*
- **Legend** (`flex:1`): up to 7 rows, each a colored dot (`9px; border-radius:50%` with a
  matching `box-shadow:0 0 8px <color>` glow) + name (left) and amount (right,
  `tabular-nums`). `13px`.
- Categories & colors:
  | Category | Amount | Color |
  |---|---|---|
  | Housing | £1,200.00 | `#0a84ff` |
  | Groceries | £480.00 | `#34e0c4` |
  | Transport | £320.00 | `#30b0ff` |
  | Dining | £285.00 | `#5e5ce6` |
  | Utilities | £210.00 | `#bf5af2` |
  | Shopping | £187.50 | `#7d7aff` |
  | Entertainment | £165.00 | `#64d2ff` |

**Recent Transactions** panel — glass, same padding/title. List of rows, each
`padding:11px 0; border-bottom:1px solid rgba(255,255,255,0.06)`:
- Left: 34×34 icon tile (`border-radius:11px`, tinted `iconBg`, `1px` white border) +
  two-line text — description (`13.5px/500; #f5f5f7`, ellipsis) and meta (`11.5px;
  color:rgba(245,245,247,0.45)`, e.g. "24 Jun · Groceries").
- Right: signed amount, `14px/550; tabular-nums`; income `#34e0c4` with `+`, expense
  `#ff6b8a` with `−` (U+2212 minus).
- Sample rows: Monthly Salary +£3,200.00 (25 Jun · Salary); Tesco −£42.50 (24 Jun ·
  Groceries); Dinner — Padella −£64.00 (22 Jun · Dining); Shell −£58.20 (20 Jun ·
  Transport); Freelance Project +£1,000.00 (18 Jun · Income); Netflix −£12.99 (15 Jun ·
  Entertainment); Octopus Energy −£98.40 (10 Jun · Utilities).

**Balances by Account** panel — glass, `padding:22px; border-radius:22px`. Inner 3-col
grid of nested cards (`padding:18px; border-radius:16px; rgba(255,255,255,0.04)` fill,
`rgba(255,255,255,0.08)` border, inset highlight). Each card: name + small 26×26 icon
tile (top row), UPPERCASE type (`11px; letter-spacing:0.06em; color:rgba(245,245,247,0.4)`),
then balance `22px/650; tabular-nums`. Negative balances render `#ff6b8a` with a `−`;
positive `#f5f5f7`.
- Cards: Current Account / Checking / £8,420.55; Savings / Savings / £11,200.00;
  Credit Card / Credit / −£1,188.45.

**User chip** (sidebar footer) — 30×30 gradient avatar circle + "Alex Morgan / Personal"
(`12px`). Replace with real user/profile data if available.

## Interactions & Behavior
- Month `‹`/`›` re-fetch summary, by-category, and recent transactions for the new month
  (the existing `MonthSelector` + `useEffect([month])` already do this — restyle, keep logic).
- Nav switches the active tab (existing `App.tsx` tab state). Apply the active-pill style
  to the selected tab.
- Hover states: nav items lighten; month/arrow buttons get `rgba(255,255,255,0.08)` bg.
- No new animations beyond the **background bloom drift** (purely decorative).

### Animations (background bloom only)
Three keyframes, `ease-in-out infinite`, translating + slightly scaling each blob:
- blob 1: `drift1` 22s — `translate(6%,-4%) scale(1.12)` at 50%.
- blob 2: `drift2` 28s — `translate(-5%,5%) scale(1.08)` at 50%.
- blob 3: `drift3` 25s — `translate(4%,6%) scale(1.10)` at 50%.
Respect `prefers-reduced-motion` (pause/remove drift).

## State Management
No new state. Reuse the existing Dashboard data fetching: `api.totals(month)`,
`api.byCategory(month, "expense")`, `api.listTransactions({ month })`, `api.balances()`,
plus the `useCurrency()` context for formatting. (All numbers above are sample/seed
values for visual reference — bind to live API data.)

## Design Tokens

**Colors**
| Token | Value | Use |
|---|---|---|
| bg base | `#08080b` | app background |
| text primary | `#f5f5f7` | headings, values |
| text secondary | `rgba(245,245,247,0.62)` | nav inactive |
| text tertiary | `rgba(245,245,247,0.45–0.5)` | labels, meta |
| glass fill | `rgba(255,255,255,0.055)` | primary panels (alt: `0.03` / `0.09`) |
| glass fill (nested) | `rgba(255,255,255,0.04)` | account cards, chips |
| border | `rgba(255,255,255,0.10)` | panel borders |
| border (nested) | `rgba(255,255,255,0.08)` | nested cards |
| edge highlight | `rgba(255,255,255,0.18)` | inset top specular |
| accent (blue) | `#0a84ff` | primary accent / bloom |
| teal | `#30d5c8` / `#34e0c4` | bloom + income |
| indigo | `#5e5ce6` | bloom + category |
| income | `#34e0c4` | positive amounts |
| expense | `#ff6b8a` | negative amounts |
| balance | `#64d2ff` | balance stat |
| category set | `#0a84ff #34e0c4 #30b0ff #5e5ce6 #bf5af2 #7d7aff #64d2ff` | donut/legend |

**Typography** — SF Pro system stack:
`-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif`.
All numeric values use `font-variant-numeric: tabular-nums`.
Scale: page title 26/600/-0.02em · stat value 26/650/-0.02em · account balance 22/650 ·
donut total 21/650 · nav 14/450–550 · body 13–14 · labels 11–13 (UPPERCASE,
letter-spacing 0.06–0.08em).

**Radii** — 9px (small buttons), 11–12px (icon tiles), 13–16px (nav/cards), 20–24px (panels).

**Blur** — panels `blur(34px) saturate(180%)` (`30px` for the small month pill); bloom
blobs `blur(90–110px)`.

**Shadows** — panel: `inset 0 1px 0 0 rgba(255,255,255,0.18), 0 14px 34px -16px rgba(0,0,0,0.6)`.
Sidebar uses a deeper `0 18px 40px -14px rgba(0,0,0,0.6)`. Dot glow: `0 0 8px <color>`.

**Spacing** — app padding 18–30px; panel padding 20–22px; grid gaps 14–16px; tile/list
inner gaps 4–20px.

## Assets
None to import. Icons are Unicode glyphs/emoji as placeholders (↑ ↓ ≈ ◈ ◧ ⇅ ◔ ◫ ⚙ 🛒 🍽
⛽ ▶ ⚡ 💳 🏦). **Recommendation:** swap these for the codebase's existing icon set (e.g.
lucide / heroicons) for crisp, consistent iconography. The gradient avatar and brand "£"
tile are CSS-only.

## Files
- `Dashboard.dc.html` — the high-fidelity HTML reference for this screen (open in a
  browser to inspect). All styling is inline; values above are extracted from it.
- Target files in the codebase to modify:
  - `client/src/pages/Dashboard.tsx` — the screen to reskin.
  - `client/src/components/ui.tsx` — `Tile`, `StatTile`, `Button`, `Modal`,
    `SectionTitle`, `Field` primitives (add the glass treatment here so all tabs inherit it).
  - `client/src/App.tsx` — sidebar + nav active-pill styling.
  - `client/src/index.css` — body background, font stack, glass utility classes, form
    control restyle.
  - `client/tailwind.config.js` — **remove the global `borderRadius: 0` override** so
    rounded corners are possible; consider adding the color tokens above to the theme.

## Tweakable parameters (from the prototype)
The reference exposes three knobs you may wish to surface or hard-code:
- **accent** — bloom hue (`#0a84ff` default; also `#30d5c8`, `#5e5ce6`, `#bf5af2`).
- **bloom** — bloom opacity `0–1` (default `0.5`); lower = subtler frost.
- **glass** — panel fill opacity (`0.03` / `0.055` default / `0.09`).
