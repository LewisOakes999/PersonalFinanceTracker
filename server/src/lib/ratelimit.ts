import type { NextFunction, Request, Response } from "express";
import { getUserId } from "./auth.js";

/**
 * Tiny in-memory fixed-window rate limiter.
 *
 * `keyOn` picks the bucket: "ip" for pre-auth routes (login/signup), "user" for
 * authenticated ones so a single account can't flood writes regardless of how
 * many IPs it uses. Idle buckets are swept periodically so the map can't grow
 * without bound from unique keys.
 *
 * Note this is per-process: with multiple instances each holds its own counts.
 * Adequate for blunting abuse; a shared store (Redis) would be needed for hard
 * guarantees across a horizontally-scaled deployment.
 */
export function rateLimit({
  windowMs,
  max,
  keyOn = "ip",
  methods,
  message = "Too many attempts. Please wait a bit and try again.",
}: {
  windowMs: number;
  max: number;
  keyOn?: "ip" | "user";
  /** Only count these HTTP methods (e.g. writes). Omit to count everything. */
  methods?: string[];
  message?: string;
}) {
  const hits = new Map<string, number[]>();

  // Evict buckets that have fully aged out, so unique keys don't accumulate.
  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length === 0) hits.delete(key);
      else hits.set(key, recent);
    }
  }, windowMs);
  sweep.unref?.(); // never keep the process alive just for the sweep

  return (req: Request, res: Response, next: NextFunction) => {
    if (methods && !methods.includes(req.method)) return next();

    let key: string;
    if (keyOn === "user") {
      try {
        key = `u:${getUserId(req)}`;
      } catch {
        key = `ip:${req.ip ?? "unknown"}`; // unauthenticated: fall back to IP
      }
    } else {
      key = `ip:${req.ip || req.socket.remoteAddress || "unknown"}`;
    }

    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (recent.length >= max) {
      const retryMs = windowMs - (now - recent[0]);
      res.setHeader("Retry-After", Math.ceil(retryMs / 1000));
      res.status(429).json({ error: message });
      return;
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

/** Per-account cap on writes — blunts scripted flooding of the database. */
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  keyOn: "user",
  methods: ["POST", "PUT", "PATCH", "DELETE"],
  message: "You're making changes too quickly. Please slow down and try again shortly.",
});

/** Per-account cap on uploads, which are far more expensive than a JSON write. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  keyOn: "user",
  methods: ["POST"],
  message: "Upload limit reached. Please try again later.",
});
