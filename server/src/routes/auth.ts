import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError } from "../lib/http.js";
import {
  createToken,
  getUserId,
  hashPassword,
  requireAuth,
  verifyPassword,
} from "../lib/auth.js";
import { provisionUserDefaults } from "../lib/defaults.js";
import { rateLimit } from "../lib/ratelimit.js";

// Blunt brute-force: 10 attempts per IP per 15 minutes on credential endpoints.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function publicUser(user: { id: string; email: string }) {
  return { id: user.id, email: user.email };
}

// GET /api/auth/status — is first-run setup still needed?
authRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    const count = await prisma.user.count();
    res.json({ needsSetup: count === 0 });
  })
);

// POST /api/auth/setup — register a new account (open signup, multi-user).
authRouter.post(
  "/setup",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const user = await prisma.user.create({
      data: { email: email.toLowerCase(), passwordHash: hashPassword(password) },
    });
    // Give the new user a usable starting point (account + categories, no transactions).
    await provisionUserDefaults(user.id);
    res.status(201).json({ token: createToken(user.id), user: publicUser(user) });
  })
);

// POST /api/auth/login — validate credentials, return a token.
authRouter.post(
  "/login",
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = credentials.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new HttpError(401, "Invalid email or password");
    }
    res.json({ token: createToken(user.id), user: publicUser(user) });
  })
);

// GET /api/auth/me — current user (requires auth).
authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: getUserId(req) } });
    if (!user) throw new HttpError(401, "Unauthorized");
    res.json({ user: publicUser(user) });
  })
);

// PUT /api/auth/credentials — change email and/or password (requires current password).
authRouter.put(
  "/credentials",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        currentPassword: z.string().min(1),
        email: z.string().email().optional(),
        newPassword: z.string().min(8).optional(),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: getUserId(req) } });
    if (!user || !verifyPassword(body.currentPassword, user.passwordHash)) {
      throw new HttpError(401, "Current password is incorrect");
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: body.email ? body.email.toLowerCase() : undefined,
        passwordHash: body.newPassword ? hashPassword(body.newPassword) : undefined,
      },
    });
    res.json({ user: publicUser(updated) });
  })
);
