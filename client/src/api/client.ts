import type {
  Account,
  Asset,
  Attachment,
  Balances,
  Budget,
  Category,
  CategoryRule,
  CategoryTotal,
  ExchangeRate,
  Forecast,
  Settings,
  SpendingInsights,
  Goal,
  InvestmentForecast,
  IsaAllowance,
  Liability,
  NetWorthPoint,
  Recurring,
  RecurringTransfer,
  TaxSummary,
  Totals,
  Transaction,
  Transfer,
  Valuation,
  TrendPoint,
  User,
} from "../types";

import { toast } from "./../lib/toast";

const BASE = "/api";
const TOKEN_KEY = "finance_auth_token";

let authToken: string | null = localStorage.getItem(TOKEN_KEY);
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAuthToken(): string | null {
  return authToken;
}

/** Registered by the auth provider so an expired/invalid token logs the user out. */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...options.headers },
  });

  // A 401 anywhere except an explicit login/setup attempt means the session is gone.
  const isCredentialAttempt = path === "/auth/login" || path === "/auth/setup";
  if (res.status === 401 && !isCredentialAttempt) {
    setAuthToken(null);
    onUnauthorized?.();
    toast.error("Your session has expired. Please sign in again.");
    throw new Error("Your session has expired. Please sign in again.");
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // Auth
  authStatus: () => request<{ needsSetup: boolean }>("/auth/status"),
  authSetup: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/setup", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  authLogin: (email: string, password: string) =>
    request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  authMe: () => request<{ user: User }>("/auth/me"),
  updateCredentials: (payload: {
    currentPassword: string;
    email?: string;
    newPassword?: string;
  }) => request<{ user: User }>("/auth/credentials", { method: "PUT", body: JSON.stringify(payload) }),

  // Transactions
  listTransactions: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<Transaction[]>(`/transactions${qs ? `?${qs}` : ""}`);
  },
  createTransaction: (data: Record<string, unknown>) =>
    request<Transaction>("/transactions", { method: "POST", body: JSON.stringify(data) }),
  updateTransaction: (id: string, data: Record<string, unknown>) =>
    request<Transaction>(`/transactions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTransaction: (id: string) => request<void>(`/transactions/${id}`, { method: "DELETE" }),

  // Transfers (between own accounts)
  listTransfers: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<Transfer[]>(`/transfers${qs ? `?${qs}` : ""}`);
  },
  createTransfer: (data: {
    date: string;
    amount: number;
    fromAccountId: string;
    toAccountId: string;
    note?: string | null;
  }) => request<Transfer>("/transfers", { method: "POST", body: JSON.stringify(data) }),
  updateTransfer: (
    id: string,
    data: {
      date: string;
      amount: number;
      fromAccountId: string;
      toAccountId: string;
      note?: string | null;
    }
  ) => request<Transfer>(`/transfers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTransfer: (id: string) => request<void>(`/transfers/${id}`, { method: "DELETE" }),

  // Recurring transactions
  listRecurring: () => request<Recurring[]>("/recurring"),
  createRecurring: (data: Record<string, unknown>) =>
    request<Recurring>("/recurring", { method: "POST", body: JSON.stringify(data) }),
  updateRecurring: (id: string, data: Record<string, unknown>) =>
    request<Recurring>(`/recurring/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRecurring: (id: string) => request<void>(`/recurring/${id}`, { method: "DELETE" }),

  // Recurring transfers
  listRecurringTransfers: () => request<RecurringTransfer[]>("/recurring-transfers"),
  createRecurringTransfer: (data: Record<string, unknown>) =>
    request<RecurringTransfer>("/recurring-transfers", { method: "POST", body: JSON.stringify(data) }),
  updateRecurringTransfer: (id: string, data: Record<string, unknown>) =>
    request<RecurringTransfer>(`/recurring-transfers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRecurringTransfer: (id: string) =>
    request<void>(`/recurring-transfers/${id}`, { method: "DELETE" }),

  // Goals
  listGoals: () => request<Goal[]>("/goals"),
  createGoal: (data: Record<string, unknown>) =>
    request<Goal>("/goals", { method: "POST", body: JSON.stringify(data) }),
  updateGoal: (id: string, data: Record<string, unknown>) =>
    request<Goal>(`/goals/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteGoal: (id: string) => request<void>(`/goals/${id}`, { method: "DELETE" }),

  // Attachments (receipts)
  listAttachments: (transactionId: string) =>
    request<Attachment[]>(`/attachments?transactionId=${transactionId}`),
  uploadAttachment: async (transactionId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/attachments?transactionId=${transactionId}`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || "Upload failed");
    }
    return res.json() as Promise<Attachment>;
  },
  deleteAttachment: (id: string) => request<void>(`/attachments/${id}`, { method: "DELETE" }),
  openAttachment: async (id: string) => {
    const res = await fetch(`${BASE}/attachments/${id}`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Could not open attachment");
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
  },

  // Categories
  listCategories: () => request<Category[]>("/categories"),
  createCategory: (data: Partial<Category>) =>
    request<Category>("/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id: string, data: Partial<Category>) =>
    request<Category>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCategory: (id: string) => request<void>(`/categories/${id}`, { method: "DELETE" }),

  // Auto-categorisation rules
  listCategoryRules: () => request<CategoryRule[]>("/category-rules"),
  createCategoryRule: (data: { match: string; categoryId: string }) =>
    request<CategoryRule>("/category-rules", { method: "POST", body: JSON.stringify(data) }),
  deleteCategoryRule: (id: string) =>
    request<void>(`/category-rules/${id}`, { method: "DELETE" }),
  applyCategoryRules: (onlyUncategorized: boolean) =>
    request<{ updated: number }>("/category-rules/apply", {
      method: "POST",
      body: JSON.stringify({ onlyUncategorized }),
    }),

  // Account valuations (mark-to-market / reconciliation)
  listValuations: (accountId?: string) =>
    request<Valuation[]>(`/valuations${accountId ? `?accountId=${accountId}` : ""}`),
  createValuation: (data: { accountId: string; date: string; value: number; note?: string | null }) =>
    request<Valuation>("/valuations", { method: "POST", body: JSON.stringify(data) }),
  deleteValuation: (id: string) => request<void>(`/valuations/${id}`, { method: "DELETE" }),

  // Accounts
  listAccounts: () => request<Account[]>("/accounts"),
  createAccount: (data: Partial<Account>) =>
    request<Account>("/accounts", { method: "POST", body: JSON.stringify(data) }),
  updateAccount: (id: string, data: Partial<Account>) =>
    request<Account>(`/accounts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAccount: (id: string) => request<void>(`/accounts/${id}`, { method: "DELETE" }),

  // Liabilities (loans, mortgages, leases…)
  listLiabilities: () => request<Liability[]>("/liabilities"),
  createLiability: (data: Partial<Liability>) =>
    request<Liability>("/liabilities", { method: "POST", body: JSON.stringify(data) }),
  updateLiability: (id: string, data: Partial<Liability>) =>
    request<Liability>(`/liabilities/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteLiability: (id: string) => request<void>(`/liabilities/${id}`, { method: "DELETE" }),

  // Other assets (property, vehicles…)
  listAssets: () => request<Asset[]>("/assets"),
  createAsset: (data: Partial<Asset>) =>
    request<Asset>("/assets", { method: "POST", body: JSON.stringify(data) }),
  updateAsset: (id: string, data: Partial<Asset>) =>
    request<Asset>(`/assets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAsset: (id: string) => request<void>(`/assets/${id}`, { method: "DELETE" }),

  // Budgets
  listBudgets: (month: string) => request<Budget[]>(`/budgets?month=${month}`),
  upsertBudget: (data: { categoryId: string; month: string; amount: number }) =>
    request<Budget>("/budgets", { method: "POST", body: JSON.stringify(data) }),
  deleteBudget: (id: string) => request<void>(`/budgets/${id}`, { method: "DELETE" }),

  // Summary
  totals: (params: Record<string, string> = {}) =>
    request<Totals>(`/summary/totals?${new URLSearchParams(params)}`),
  balances: () => request<Balances>("/summary/balances"),
  byCategory: (params: Record<string, string> = {}, type: "income" | "expense" = "expense") =>
    request<CategoryTotal[]>(
      `/summary/by-category?${new URLSearchParams({ ...params, type })}`
    ),
  trend: (months = 12) => request<TrendPoint[]>(`/summary/trend?months=${months}`),
  netWorth: (months = 12) => request<NetWorthPoint[]>(`/summary/networth?months=${months}`),
  isaAllowance: () => request<IsaAllowance>("/summary/isa-allowance"),
  insights: (month?: string) =>
    request<SpendingInsights>(`/summary/insights${month ? `?month=${month}` : ""}`),
  investmentForecast: (params: {
    accountId?: string;
    months?: number;
    monthlyContribution?: number;
    expectedReturn?: number;
    volatility?: number;
    target?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v != null && v !== "") qs.set(k, String(v));
    const q = qs.toString();
    return request<InvestmentForecast>(`/summary/investment-forecast${q ? `?${q}` : ""}`);
  },
  forecast: (params: { months?: number; monthlyIncome?: number; monthlyExpenses?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.months != null) qs.set("months", String(params.months));
    if (params.monthlyIncome != null) qs.set("monthlyIncome", String(params.monthlyIncome));
    if (params.monthlyExpenses != null) qs.set("monthlyExpenses", String(params.monthlyExpenses));
    const q = qs.toString();
    return request<Forecast>(`/summary/forecast${q ? `?${q}` : ""}`);
  },

  // Exchange rates
  listRates: () => request<ExchangeRate[]>("/rates"),
  setRate: (currency: string, rate: number) =>
    request<ExchangeRate>("/rates", { method: "PUT", body: JSON.stringify({ currency, rate }) }),
  deleteRate: (currency: string) => request<void>(`/rates/${currency}`, { method: "DELETE" }),

  // Tax
  taxSummary: (year?: number) =>
    request<TaxSummary>(`/tax/summary${year ? `?year=${year}` : ""}`),

  // Backup & restore
  downloadBackup: async () => {
    const res = await fetch(`${BASE}/backup`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Backup failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },
  restoreBackup: (data: unknown) =>
    request<{ restored: boolean }>("/backup/restore", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Settings
  getSettings: () => request<Settings>("/settings"),
  updateSettings: (currency: string) =>
    request<Settings>("/settings", { method: "PUT", body: JSON.stringify({ currency }) }),

  // CSV import (multipart — no JSON content-type)
  importCsv: async (file: File, accountId?: string) => {
    const form = new FormData();
    form.append("file", file);
    if (accountId) form.append("accountId", accountId);
    const res = await fetch(`${BASE}/import`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || "Import failed");
    }
    return res.json() as Promise<{
      imported: number;
      failed: number;
      errors: { line: number; message: string }[];
    }>;
  },

  // CSV export — fetched with auth, then downloaded as a blob.
  exportCsv: async () => {
    const res = await fetch(`${BASE}/export/transactions.csv`, { headers: authHeaders() });
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
