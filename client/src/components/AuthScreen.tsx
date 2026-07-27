import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../lib/AuthContext";
import { Button, Field } from "./ui";
import { BrandTile } from "./BrandMark";
import { PasswordStrength } from "./PasswordStrength";
import { passwordValid } from "../lib/password";

export default function AuthScreen({
  initialMode,
  onBack,
}: {
  initialMode?: "login" | "signup";
  onBack?: () => void;
} = {}) {
  const { needsSetup, login, signup } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(
    initialMode ?? (needsSetup ? "signup" : "login")
  );
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
      if (!passwordValid(password))
        return setError(
          "Password must be at least 8 characters and include an uppercase letter and a symbol."
        );
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
      <div className="glass relative z-[1] w-full max-w-[400px] rounded-panel p-8">
        {onBack && (
          <button
            onClick={onBack}
            className="text-glass-3 hover:text-glass mb-4 text-[13px] transition-colors"
          >
            ← Back to home
          </button>
        )}
        {/* Brand */}
        <div className="mb-7 flex items-center gap-3">
          <BrandTile size={42} />
          <div>
            <div className="text-glass text-[17px] font-semibold tracking-tight">
              SuperSaver
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
          {isSignup && <PasswordStrength password={password} />}
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
