import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AuthScreen from "./components/AuthScreen";
import { Bloom } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { CurrencyProvider } from "./lib/CurrencyContext";
import { ToastViewport } from "./components/ToastViewport";
import "./index.css";

function Root() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <Bloom />
        <div className="text-glass-3 relative z-[1] text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) return <AuthScreen />;

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
