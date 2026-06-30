# Deploying Finance Tracker

The app deploys as **one service**: the Express server serves the JSON API *and*
the built React client from the same origin (so there's no CORS and no separate
static host). It needs a **PostgreSQL** database alongside it.

```
┌─────────────────────────────┐        ┌──────────────┐
│  Web service (Docker)        │  SQL   │  PostgreSQL  │
│  Express → /api/* + client   │ ─────► │  (managed)   │
└─────────────────────────────┘        └──────────────┘
```

The `Dockerfile` builds both the client and server, then on start runs
`prisma migrate deploy` (applies migrations) and launches the server.

---

## Option A — Render (recommended, uses `render.yaml`)

1. Push this repo to GitHub (already done).
2. In the [Render dashboard](https://dashboard.render.com) → **New** → **Blueprint**,
   pick this repo. Render reads `render.yaml` and creates:
   - a **PostgreSQL** database, and
   - a **web service** built from the `Dockerfile`.
3. Render auto-generates `AUTH_SECRET` and injects `DATABASE_URL`. After the first
   deploy, set **`CLIENT_ORIGIN`** to your final URL (e.g. `https://finance-tracker.onrender.com`).
4. Open the URL → you'll get the landing page → **Sign up** creates the first account.

> ⚠️ Render's **free** Postgres is deleted after ~30 days. For a public app, use a
> paid database tier (or external Neon/Supabase) and enable automated backups.

## Option B — Railway

Railway can deploy the same `Dockerfile`:
1. New project → **Deploy from GitHub repo**.
2. Add a **PostgreSQL** plugin; Railway sets `DATABASE_URL`.
3. Add env vars: `AUTH_SECRET` (run `openssl rand -hex 32`), `NODE_ENV=production`.
4. Deploy. Railway injects `PORT`; the server respects it.

## Option C — Any Docker host / VPS

```bash
docker build -t finance-tracker .
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require" \
  -e AUTH_SECRET="$(openssl rand -hex 32)" \
  finance-tracker
```

Put a reverse proxy (Caddy/Nginx) in front for HTTPS, or use the host's TLS.

---

## Required environment variables

| Var | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | yes | Postgres connection string (use `sslmode=require` on managed DBs). |
| `AUTH_SECRET` | yes | Long random secret for signing tokens. `openssl rand -hex 32`. |
| `NODE_ENV` | yes | Must be `production` so the server serves the client. |
| `PORT` | no | Host usually injects it; defaults to `4000`. |
| `CLIENT_ORIGIN` | no | Only needed if the client is hosted on a different origin. |

See `server/.env.production.example`.

---

## ⚠️ Before you open public sign-ups

This app stores other people's **financial data**. Don't skip these:

- **Email verification + password reset** — not built yet; needed to stop abuse and
  let users recover accounts (requires an email provider, e.g. Resend/Postmark).
- **Legal (UK)** — you'd be a data controller: publish a **privacy policy** and
  **terms**, and register with the **ICO**. Get these reviewed by someone qualified.
- **Backups** — turn on automated daily database backups.
- **Attachments** — receipts are currently stored *in Postgres*; move them to object
  storage (S3 / Cloudflare R2) before they balloon your DB.
- **Monitoring** — add error tracking (e.g. Sentry) and uptime checks.

Because the app is **manual-entry only** (no bank connections, no moving real money),
it is not FCA-regulated financial software — these are data-protection obligations,
not financial-services regulation. Adding Open Banking later would change that.
