import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthScreen from "./components/AuthScreen";
import Landing from "./pages/Landing";
import { Bloom } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { CurrencyProvider } from "./lib/CurrencyContext";
import { ToastViewport } from "./components/ToastViewport";
import "./index.css";

function Root() {
  const { loading, user } = useAuth();
  // Logged-out flow: marketing landing → auth screen (in the chosen mode).
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <Bloom />
        <div className="text-glass-3 relative z-[1] text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return authMode ? (
      <AuthScreen initialMode={authMode} onBack={() => setAuthMode(null)} />
    ) : (
      <Landing onLogin={() => setAuthMode("login")} onSignup={() => setAuthMode("signup")} />
    );
  }

  // Currency settings require auth, so only mount the provider once signed in.
  return (
    <CurrencyProvider>
      <App />
    </CurrencyProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
    <ToastViewport />
  </React.StrictMode>
);

// Register the service worker for install/offline support — production only, so
// the dev server never serves stale bundles from a cache.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
