import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api/client";
import { formatCurrency } from "./format";

interface CurrencyContextValue {
  currency: string;
  setCurrency: (code: string) => Promise<void>;
  format: (value: number) => string;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState("GBP");

  useEffect(() => {
    api.getSettings().then((s) => setCurrencyState(s.currency)).catch(() => {});
  }, []);

  const setCurrency = useCallback(async (code: string) => {
    const updated = await api.updateSettings(code);
    setCurrencyState(updated.currency);
  }, []);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currency,
      setCurrency,
      format: (v: number) => formatCurrency(v, currency),
    }),
    [currency, setCurrency]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
