import type { NextFunction, Request, Response } from "express";

/**
 * Tiny in-memory fixed-window rate limiter (per client IP). Enough to blunt
 * brute-force attempts on auth endpoints for a locally-hosted app.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

    if (recent.length >= max) {
      const retryMs = windowMs - (now - recent[0]);
      res.setHeader("Retry-After", Math.ceil(retryMs / 1000));
      res.status(429).json({ error: "Too many attempts. Please wait a bit and try again." });
      return;
    }

    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
