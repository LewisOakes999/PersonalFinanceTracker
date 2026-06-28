import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../lib/AuthContext";
import { Bloom, Button, Field } from "./ui";

export default function AuthScreen() {
  const { needsSetup, login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(needsSetup ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  const switchMode = () => {
    setMode(isSignup ? "login" : "signup");
    setError("");
    setConfirm("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (isSignup) {
      if (password.length < 8) return setError("Password must be at least 8 characters.");
      if (password !== confirm) return setError("Passwords do not match.");
    }
    setBusy(true);
    try {
      if (isSignup) await signup(email.trim(), password);
      else await login(email.trim(), password);
      // On success the gate swaps to the app automatically.
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden p-4">
      <Bloom />
      <div className="glass relative z-[1] w-full max-w-[400px] rounded-panel p-8">
        {/* Brand */}
        <div className="mb-7 flex items-center gap-3">
          <div
            className="flex h-[42px] w-[42px] items-center justify-center rounded-xl text-xl font-bold text-white"
            style={{
              background: "linear-gradient(140deg, #0a84ff, #30d5c8)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.5), 0 6px 16px -4px rgba(10,132,255,0.6)",
            }}
          >
            £
          </div>
          <div>
            <div className="text-glass text-[17px] font-semibold tracking-tight">
              Finance Tracker
            </div>
            <div className="text-glass-3 text-xs">
              {isSignup ? "Create an account" : "Sign in to continue"}
            </div>
          </div>
        </div>

        <h1 className="text-glass text-[22px] font-semibold tracking-tight">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-glass-3 mb-6 mt-1 text-[13px]">
          {isSignup
            ? "Choose the email and password you'll use to sign in. Your data is private to this account."
            : "Enter your email and password to access your finances."}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <input
              type="email"
              className="w-full"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              className="w-full"
              autoComplete={isSignup ? "new-password" : "current-password"}
              placeholder={isSignup ? "At least 8 characters" : "Your password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {isSignup && (
            <Field label="Confirm password">
              <input
                type="password"
                className="w-full"
                autoComplete="new-password"
                placeholder="Re-enter password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </Field>
          )}

          {error && (
            <div className="rounded-xl border border-[rgba(255,107,138,0.4)] bg-[rgba(255,107,138,0.12)] px-3 py-2 text-sm text-[#ff9bae]">
              {error}
            </div>
          )}

          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            {busy
              ? isSignup
                ? "Creating account…"
                : "Signing in…"
              : isSignup
                ? "Create account"
                : "Sign in"}
          </Button>
        </form>

        <div className="text-glass-3 mt-5 text-center text-[13px]">
          {isSignup ? "Already have an account?" : "New here?"}{" "}
          <button onClick={switchMode} className="text-[#64d2ff] hover:underline">
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </div>
      </div>
    </div>
  );
}
