import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { HttpError } from "./lib/http.js";
import { requireAuth } from "./lib/auth.js";
import { authRouter } from "./routes/auth.js";
import { transactionsRouter } from "./routes/transactions.js";
import { transfersRouter } from "./routes/transfers.js";
import { recurringRouter } from "./routes/recurring.js";
import { recurringTransfersRouter } from "./routes/recurringTransfers.js";
import { goalsRouter } from "./routes/goals.js";
import { taxRouter } from "./routes/tax.js";
import { valuationsRouter } from "./routes/valuations.js";
import { backupRouter } from "./routes/backup.js";
import { ratesRouter } from "./routes/rates.js";
import { attachmentsRouter } from "./routes/attachments.js";
import { categoriesRouter } from "./routes/categories.js";
import { categoryRulesRouter } from "./routes/categoryRules.js";
import { accountsRouter } from "./routes/accounts.js";
import { liabilitiesRouter } from "./routes/liabilities.js";
import { assetsRouter } from "./routes/assets.js";
import { budgetsRouter } from "./routes/budgets.js";
import { summaryRouter } from "./routes/summary.js";
import { settingsRouter } from "./routes/settings.js";
import { importRouter } from "./routes/import.js";
import { exportRouter } from "./routes/export.js";
import { writeLimiter } from "./lib/ratelimit.js";

const app = express();
const port = Number(process.env.PORT) || 4000;
const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

// Behind a hosting proxy (Render, Fly, nginx…) the socket address is the
// proxy's, so every visitor would share one rate-limit bucket — one abuser
// could lock everyone out. Trust the first proxy hop so req.ip is the real
// client. Only enabled in production, where a proxy is actually in front.
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(cors({ origin: origins }));
// Most endpoints only ever receive small JSON; only a backup restore is large,
// so the generous limit is scoped to that route rather than applied globally.
app.use("/api/backup/restore", express.json({ limit: "25mb" }));
app.use(express.json({ limit: "200kb" }));

// Public routes.
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);

// Everything below requires a valid token.
app.use("/api", requireAuth);
// Blunt per-user flood protection on authenticated writes.
app.use("/api", writeLimiter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/transfers", transfersRouter);
app.use("/api/recurring", recurringRouter);
app.use("/api/recurring-transfers", recurringTransfersRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/tax", taxRouter);
app.use("/api/valuations", valuationsRouter);
app.use("/api/backup", backupRouter);
app.use("/api/rates", ratesRouter);
app.use("/api/attachments", attachmentsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/category-rules", categoryRulesRouter);
app.use("/api/accounts", accountsRouter);
app.use("/api/liabilities", liabilitiesRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/budgets", budgetsRouter);
app.use("/api/summary", summaryRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/import", importRouter);
app.use("/api/export", exportRouter);

// In production, serve the built client from this same server so the app and
// the API share one origin (no CORS, no separate static host). In development
// the Vite dev server handles the client instead.
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist =
    process.env.CLIENT_DIST || path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  // SPA fallback: any non-API route returns index.html.
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Central error handler.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.flatten() });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Body larger than the configured limit (body-parser / multer).
  const code = (err as { code?: string; type?: string })?.type ?? (err as { code?: string }).code;
  if (code === "entity.too.large") {
    return res.status(413).json({ error: "That request is too large." });
  }
  if (code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "That file is too large (8 MB maximum)." });
  }
  if (code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ error: "Upload one file at a time." });
  }
  // Prisma "record not found" on update/delete.
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2025") {
    return res.status(404).json({ error: "Record not found" });
  }
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
    return res.status(409).json({ error: "A record with that unique value already exists" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
