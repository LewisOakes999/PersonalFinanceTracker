# SuperSaver

A self-hosted, multi-user personal finance tracker that runs locally. Track income,
expenses and transfers across multiple accounts (current, savings, credit, ISA, Premium
Bonds, investments, pensions), set budgets and savings goals, project the future
(including a Monte Carlo investment cone), and pull together the figures for a UK Self
Assessment tax return.

Built as a small monorepo: a **Vite + React + TypeScript + Tailwind** client and an
**Express + TypeScript + Prisma + PostgreSQL** API.

> **Heads up:** this is a personal tool for local use, not a hosted product, and nothing
> in it is financial or tax advice. See [Security & scope](#security--scope).

**Free and open source (MIT).** Clone it, run it on your own machine, and your data stays
in your own database — nothing is sent anywhere. [Setup](#setup) takes about five minutes.

```bash
git clone https://github.com/LewisOakes999/PersonalFinanceTracker.git
cd PersonalFinanceTracker
npm run install:all     # install client + server dependencies
npm run db:setup        # run migrations and load sample data
npm run dev             # client on :5173, API on :4000
```

You'll need Node 20+ and PostgreSQL running locally — see [Prerequisites](#prerequisites)
and step 3 for the one environment variable you must set.

---

## Features

- **Accounts** — current / savings / credit / cash / investment / pension, each with an
  interest rate (AER) or, for investments, an **expected return + volatility** chosen via
  friendly **risk-profile presets** (Cautious → Global shares → Higher risk). Flags for
  **ISA**, **Premium Bonds**, **Investment** and **Pension**.
- **Account valuations** — record what an account is actually worth (mark-to-market for
  investments/pensions) or correct a balance (reconciliation). A valuation supersedes
  activity up to its date; later transactions/transfers adjust from there.
- **Transactions** — add / edit / delete, search, filter (type, category, period),
  sort, **CSV import** and **CSV export**.
- **Transfers** — first-class moves between your own accounts; excluded from income/
  expense totals but reflected in balances.
- **Recurring transactions** — weekly … yearly schedules that auto-post when due.
- **Budgets** — monthly per-category budgets with progress bars.
- **Goals** — savings targets, tracked manually or linked to an account's live balance.
- **Dashboard** — income / expenses / net / balance for any period, spending-by-category
  donut, recent activity and per-account balances.
- **Analytics** — net worth over time, income-vs-expenses trend, spending by category and
  a category drill-down.
- **Forecast** — a deterministic cash-flow projection **and** a Monte Carlo investment
  projection (p10–p90 cone, median, probability of profit / hitting a target), with an
  optional **inflation / "today's money"** view.
- **Allowances** — ISA (£20,000) and pension (£60,000) annual-allowance tracking.
- **Tax Year Summary** — UK Self Assessment figures for a chosen tax year (6 Apr – 5 Apr):
  income by category, taxable interest & dividends (ISA/Premium Bonds excluded), Gift Aid,
  pension contributions, with a CSV export and clear caveats.
- **Flexible periods** — view any tab by month, calendar year, UK tax year, custom range
  or all-time.
- **Backup & restore** — download a full JSON backup and restore it.
- **Multi-user auth** — first-run sign-up, server-enforced auth (scrypt password hashing,
  HMAC-signed tokens), login rate-limiting, and a CLI password reset.

---

## Tech stack

| Layer    | Tech                                                            |
| -------- | --------------------------------------------------------------- |
| Client   | Vite, React 18, TypeScript, Tailwind CSS, Recharts             |
| Server   | Node, Express, TypeScript, Prisma ORM                          |
| Database | PostgreSQL                                                     |

```
PersonalFinanceTracker/
├── client/            # Vite + React app
├── server/            # Express API + Prisma schema, migrations, seed
│   ├── prisma/        # schema.prisma, migrations/, seed.ts
│   └── src/           # routes/, lib/, scripts/, index.ts
├── package.json       # root scripts (run both apps together)
└── README.md
```

---

## Prerequisites

- **Node.js** 18+ (works on current LTS / newer)
- **PostgreSQL** 14+ running locally

---

## Setup

### 1. Install dependencies

```bash
npm run install:all      # installs root, server and client deps
```

### 2. Create the database

```bash
createdb finance_tracker
```

### 3. Configure the server environment

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and set `DATABASE_URL` to match your Postgres setup:

```ini
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/finance_tracker?schema=public"
PORT=4000
CLIENT_ORIGIN="http://localhost:5173"
AUTH_SECRET="change-me-to-a-long-random-string"
```

> On a default **Homebrew** Postgres install the role is usually your macOS username with
> no password, e.g. `postgresql://yourname@localhost:5432/finance_tracker?schema=public`.
> Generate a real `AUTH_SECRET` with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

### 4. Run migrations and seed sample data

```bash
cd server
npm run prisma:migrate    # apply migrations + generate the Prisma client
npm run seed              # load the demo account with sample data
cd ..
```

### 5. Start both apps

```bash
npm run dev               # API on :4000, client on :5173
```

Open **http://localhost:5173**. On first run you'll **create your own account** (it
starts empty and private). To explore a fully-populated app instead, sign in with the
**demo account**:

- **Email:** `demo@example.com`
- **Password:** `demopass123`

> Running `npm run seed` only ever touches the demo account; your own data is untouched.

---

## Useful commands

Run from the repo root:

| Command              | What it does                                        |
| -------------------- | --------------------------------------------------- |
| `npm run dev`        | Run API + client together                           |
| `npm run dev:server` | API only                                            |
| `npm run dev:client` | Client only                                         |
| `npm run install:all`| Install all dependencies                            |

Run from `server/`:

| Command                                   | What it does                          |
| ----------------------------------------- | ------------------------------------- |
| `npm run prisma:migrate`                  | Create/apply migrations + generate    |
| `npm run seed`                            | Reset & reseed the demo account       |
| `npm run reset-password -- <email> <pw>`  | Reset a user's password (no email)    |
| `npm run build` / `npm start`             | Compile / run the production build    |

---

## API overview

All routes are under `/api`. Everything except `/api/health` and `/api/auth/*` requires a
`Bearer` token from sign-in.

| Area          | Endpoints                                                                 |
| ------------- | ------------------------------------------------------------------------- |
| Auth          | `POST /auth/setup`, `POST /auth/login`, `GET /auth/me`, `PUT /auth/credentials`, `GET /auth/status` |
| Accounts      | `GET/POST /accounts`, `PUT/DELETE /accounts/:id`                          |
| Valuations    | `GET/POST /valuations`, `DELETE /valuations/:id`                          |
| Categories    | `GET/POST /categories`, `PUT/DELETE /categories/:id`                      |
| Transactions  | `GET/POST /transactions`, `PUT/DELETE /transactions/:id`                  |
| Transfers     | `GET/POST /transfers`, `PUT/DELETE /transfers/:id`                        |
| Recurring     | `GET/POST /recurring`, `PUT/DELETE /recurring/:id`, `POST /recurring/run` |
| Budgets       | `GET/POST /budgets`, `DELETE /budgets/:id`                                |
| Goals         | `GET/POST /goals`, `PUT/DELETE /goals/:id`                                |
| Summary       | `/summary/totals`, `/balances`, `/by-category`, `/trend`, `/networth`, `/forecast`, `/investment-forecast`, `/isa-allowance` |
| Tax           | `GET /tax/summary?year=YYYY`                                              |
| Import/Export | `POST /import` (CSV), `GET /export/transactions.csv`                      |
| Backup        | `GET /backup`, `POST /backup/restore`                                     |

Most listing endpoints accept a date range via `start`/`end` (YYYY-MM-DD, end-exclusive)
or a legacy `month=YYYY-MM`.

---

## Notes & sensible defaults

- **Currency** defaults to **GBP (£)** and is configurable in Settings (display only).
- **Tax features are UK-specific**: tax year is 6 Apr – 5 Apr; ISA/pension allowances are
  £20,000 / £60,000. The Tax Year Summary **gathers figures, it doesn't compute liability**,
  and excludes ISA/Premium Bonds as tax-free.
- **Capital gains aren't tracked** — accurate CGT needs per-holding buy/sell prices and
  cost basis, which this app doesn't model.
- **Investment returns** use a long-run expected return + volatility (via risk presets);
  the Monte Carlo cone shows the range of outcomes, not a single guaranteed number.
- **Pension/ISA contributions** are counted as transfers from a non-sheltered account into
  a pension/ISA account; salary-sacrifice/employer contributions that never hit your
  accounts aren't captured.

---

## Security & scope

This is built to run **locally for one or a few trusted users**, not exposed to the
internet. Notably: auth tokens are stored in the browser's `localStorage`; there is login
rate-limiting but **no email verification or email-based password reset** (use
`npm run reset-password` instead); and `AUTH_SECRET` should be a long random string you
keep private. Don't deploy this publicly without further hardening (HTTPS, secure cookie
storage, CSRF protection, etc.).

---

## Author & licence

Created by **Lewis Oakes** — [github.com/LewisOakes999](https://github.com/LewisOakes999).

Released under the [MIT licence](LICENSE): you're free to use, modify and self-host it,
including commercially, as long as the copyright notice is kept. It comes with no
warranty.

If you find it useful, a star on the
[repo](https://github.com/LewisOakes999/PersonalFinanceTracker) is always appreciated —
and issues and pull requests are welcome.
