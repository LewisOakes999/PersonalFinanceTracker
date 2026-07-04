import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { api } from "../api/client";
import type {
  Account,
  AccountBalance,
  Category,
  ExchangeRate,
  TaxTag,
  TxnType,
  Valuation,
} from "../types";
import {
  Button,
  Field,
  InvestmentBadge,
  IsaBadge,
  PbBadge,
  PensionBadge,
  CollapsibleSection,
} from "../components/ui";
import { CURRENCIES } from "../lib/format";
import { RISK_PROFILES, matchProfile, riskHint } from "../lib/riskProfiles";
import { useCurrency } from "../lib/CurrencyContext";
import { useAuth } from "../lib/AuthContext";
import { toast } from "../lib/toast";
import { passwordValid } from "../lib/password";
import { PasswordStrength } from "../components/PasswordStrength";

const ACCOUNT_TYPES = ["current", "savings", "credit", "cash", "investment"];

/** Risk-profile preset + editable expected-return/volatility fields. */
function InvestmentFields({
  rate,
  vol,
  onRate,
  onVol,
}: {
  rate: string;
  vol: string;
  onRate: (v: string) => void;
  onVol: (v: string) => void;
}) {
  const profileId = matchProfile(Number(rate), Number(vol));
  const applyProfile = (id: string) => {
    const p = RISK_PROFILES.find((x) => x.id === id);
    if (p) {
      onRate(String(p.return));
      onVol(String(p.volatility));
    }
  };
  return (
    <>
      <Field label="Risk profile">
        <select value={profileId} onChange={(e) => applyProfile(e.target.value)}>
          {RISK_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom…</option>
        </select>
      </Field>
      <Field label="Expected return %">
        <input
          type="number"
          step="0.01"
          className="num w-24"
          value={rate}
          onChange={(e) => onRate(e.target.value)}
        />
      </Field>
      <Field label="Volatility %">
        <input
          type="number"
          step="0.01"
          min="0"
          className="num w-24"
          value={vol}
          onChange={(e) => onVol(e.target.value)}
        />
      </Field>
      <p className="text-glass-3 basis-full text-xs">{riskHint(Number(rate), Number(vol))}</p>
    </>
  );
}

export default function Settings() {
  const { currency, setCurrency, format } = useCurrency();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const loadAccounts = () => api.listAccounts().then(setAccounts);
  const loadCategories = () => api.listCategories().then(setCategories);

  useEffect(() => {
    loadAccounts();
    loadCategories();
  }, []);

  return (
    <div className="space-y-4">
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-tight text-glass">Settings</h1>
        <p className="text-glass-3 mt-1 text-[13px]">Accounts, categories and display currency</p>
      </header>

      {/* Currency */}
      <CollapsibleSection title="Base Currency">
        <div className="flex items-center gap-3">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="num text-sm text-glass-3">Example: {format(1234.5)}</span>
        </div>
        <p className="mt-2 text-xs text-glass-3">
          The currency totals and net worth are shown in. Accounts in other currencies are converted
          using the exchange rates below.
        </p>
      </CollapsibleSection>

      <RatesManager accounts={accounts} baseCurrency={currency} />
      <SecurityManager />
      <BackupManager />
      <AccountsManager accounts={accounts} onChange={loadAccounts} format={format} />
      <ValuationsManager accounts={accounts} format={format} />
      <CategoriesManager categories={categories} onChange={loadCategories} />
    </div>
  );
}

function SecurityManager() {
  const { user, setUser } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!currentPassword) return setError("Enter your current password to confirm changes.");
    if (newPassword) {
      if (!passwordValid(newPassword))
        return setError(
          "New password must be at least 8 characters and include an uppercase letter and a symbol."
        );
      if (newPassword !== confirm) return setError("New passwords do not match.");
    }
    const emailChanged = email.trim() && email.trim() !== user?.email;
    if (!emailChanged && !newPassword) return setError("Nothing to update.");

    setBusy(true);
    try {
      const { user: updated } = await api.updateCredentials({
        currentPassword,
        email: emailChanged ? email.trim() : undefined,
        newPassword: newPassword || undefined,
      });
      setUser(updated);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setMessage("Credentials updated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <CollapsibleSection title="Security">
      <form onSubmit={submit} className="max-w-md space-y-4">
        <Field label="Email">
          <input
            type="email"
            className="w-full"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </Field>
        <Field label="New password (leave blank to keep)">
          <input
            type="password"
            className="w-full"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="8+ chars, an uppercase letter and a symbol"
            autoComplete="new-password"
          />
        </Field>
        {newPassword && <PasswordStrength password={newPassword} />}
        {newPassword && (
          <Field label="Confirm new password">
            <input
              type="password"
              className="w-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
        )}
        <Field label="Current password">
          <input
            type="password"
            className="w-full"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Required to confirm"
            autoComplete="current-password"
          />
        </Field>
        {error && <div className="text-sm text-[#ff6b8a]">{error}</div>}
        {message && <div className="text-sm text-[#34e0c4]">{message}</div>}
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Saving…" : "Update credentials"}
        </Button>
      </form>
    </CollapsibleSection>
  );
}

function AccountsManager({
  accounts,
  onChange,
  format,
}: {
  accounts: Account[];
  onChange: () => void;
  format: (v: number) => string;
}) {
  const { currency: baseCurrency } = useCurrency();
  const [name, setName] = useState("");
  const [type, setType] = useState("current");
  const [currency, setCurrency] = useState(baseCurrency);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [interestRate, setInterestRate] = useState("0");
  const [volatility, setVolatility] = useState("0");
  const [isIsa, setIsIsa] = useState(false);
  const [isPremiumBonds, setIsPremiumBonds] = useState(false);
  const [isInvestment, setIsInvestment] = useState(false);
  const [isPension, setIsPension] = useState(false);
  const [error, setError] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Name is required.");
    await api.createAccount({
      name: name.trim(),
      type,
      currency,
      openingBalance: Number(openingBalance) || 0,
      interestRate: Number(interestRate) || 0,
      volatility: isInvestment ? Number(volatility) || 0 : 0,
      isIsa,
      isPremiumBonds,
      isInvestment,
      isPension,
    });
    setName("");
    setCurrency(baseCurrency);
    setOpeningBalance("0");
    setInterestRate("0");
    setVolatility("0");
    setIsIsa(false);
    setIsPremiumBonds(false);
    setIsInvestment(false);
    setIsPension(false);
    onChange();
  };

  const remove = async (id: string) => {
    try {
      await api.deleteAccount(id);
      onChange();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <CollapsibleSection title="Accounts" defaultOpen>
      <ul className="mb-4 divide-y divide-white/10">
        {accounts.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            format={format}
            onChange={onChange}
            onRemove={() => remove(a.id)}
          />
        ))}
      </ul>
      <form onSubmit={add} data-tour="add-account" className="flex flex-wrap items-end gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joint Account" />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Opening balance">
          <input
            type="number"
            step="0.01"
            className="num w-28"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
        </Field>
        {isInvestment ? (
          <InvestmentFields
            rate={interestRate}
            vol={volatility}
            onRate={setInterestRate}
            onVol={setVolatility}
          />
        ) : (
          <Field label="Interest % (AER)">
            <input
              type="number"
              step="0.01"
              className="num w-24"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
            />
          </Field>
        )}
        <label className="flex items-center gap-2 pb-2 text-sm text-glass">
          <input
            type="checkbox"
            checked={isIsa}
            onChange={(e) => {
              setIsIsa(e.target.checked);
              if (e.target.checked) setIsPremiumBonds(false);
            }}
          />
          ISA
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-glass">
          <input
            type="checkbox"
            checked={isPremiumBonds}
            onChange={(e) => {
              setIsPremiumBonds(e.target.checked);
              if (e.target.checked) setIsIsa(false);
            }}
          />
          Premium Bonds
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-glass">
          <input
            type="checkbox"
            checked={isInvestment}
            onChange={(e) => setIsInvestment(e.target.checked)}
          />
          Investment
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-glass">
          <input
            type="checkbox"
            checked={isPension}
            onChange={(e) => setIsPension(e.target.checked)}
          />
          Pension
        </label>
        <Button type="submit" variant="primary">
          Add Account
        </Button>
      </form>
      {error && <div className="mt-2 text-sm text-[#ff6b8a]">{error}</div>}
    </CollapsibleSection>
  );
}

function AccountRow({
  account,
  format,
  onChange,
  onRemove,
}: {
  account: Account;
  format: (v: number) => string;
  onChange: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account.name);
  const [type, setType] = useState(account.type);
  const [currency, setCurrency] = useState(account.currency);
  const [openingBalance, setOpeningBalance] = useState(String(account.openingBalance));
  const [interestRate, setInterestRate] = useState(String(account.interestRate));
  const [volatility, setVolatility] = useState(String(account.volatility));
  const [isIsa, setIsIsa] = useState(account.isIsa);
  const [isPremiumBonds, setIsPremiumBonds] = useState(account.isPremiumBonds);
  const [isInvestment, setIsInvestment] = useState(account.isInvestment);
  const [isPension, setIsPension] = useState(account.isPension);

  const save = async () => {
    await api.updateAccount(account.id, {
      name: name.trim(),
      type,
      currency,
      openingBalance: Number(openingBalance) || 0,
      interestRate: Number(interestRate) || 0,
      volatility: isInvestment ? Number(volatility) || 0 : 0,
      isIsa,
      isPremiumBonds,
      isInvestment,
      isPension,
    });
    setEditing(false);
    onChange();
  };

  if (!editing) {
    return (
      <li className="flex items-center justify-between gap-3 py-2 text-sm">
        <span className="flex items-center gap-2 text-glass">
          {account.name}
          <span className="text-xs uppercase tracking-wider text-glass-3">{account.type}</span>
          {account.isIsa && <IsaBadge />}
          {account.isPremiumBonds && <PbBadge />}
          {account.isInvestment && <InvestmentBadge />}
          {account.isPension && <PensionBadge />}
        </span>
        <span className="flex items-center gap-4">
          <span className="num text-glass-3">
            {account.interestRate.toFixed(2)}%{" "}
            {account.isInvestment ? `return · ${account.volatility.toFixed(0)}% vol` : "AER"}
          </span>
          <span className="num text-glass-3">opening {format(account.openingBalance)}</span>
          <button className="text-xs text-[#64d2ff] hover:underline" onClick={() => setEditing(true)}>
            edit
          </button>
          <button className="text-xs text-[#ff6b8a] hover:underline" onClick={onRemove}>
            delete
          </button>
        </span>
      </li>
    );
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Name">
          <input className="w-40" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Opening balance">
          <input
            type="number"
            step="0.01"
            className="num w-28"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
          />
        </Field>
        {isInvestment ? (
          <InvestmentFields
            rate={interestRate}
            vol={volatility}
            onRate={setInterestRate}
            onVol={setVolatility}
          />
        ) : (
          <Field label="Interest % (AER)">
            <input
              type="number"
              step="0.01"
              className="num w-24"
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
            />
          </Field>
        )}
        <label className="flex items-center gap-2 pb-2 text-sm text-glass">
          <input
            type="checkbox"
            checked={isIsa}
            onChange={(e) => {
              setIsIsa(e.target.checked);
              if (e.target.checked) setIsPremiumBonds(false);
            }}
          />
          ISA
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-glass">
          <input
            type="checkbox"
            checked={isPremiumBonds}
            onChange={(e) => {
              setIsPremiumBonds(e.target.checked);
              if (e.target.checked) setIsIsa(false);
            }}
          />
          Premium Bonds
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-glass">
          <input
            type="checkbox"
            checked={isInvestment}
            onChange={(e) => setIsInvestment(e.target.checked)}
          />
          Investment
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-glass">
          <input
            type="checkbox"
            checked={isPension}
            onChange={(e) => setIsPension(e.target.checked)}
          />
          Pension
        </label>
        <Button variant="primary" onClick={save}>
          Save
        </Button>
        <Button onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </li>
  );
}

function RatesManager({
  accounts,
  baseCurrency,
}: {
  accounts: Account[];
  baseCurrency: string;
}) {
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [newCur, setNewCur] = useState("USD");
  const [newRate, setNewRate] = useState("");

  const load = () => api.listRates().then(setRates);
  useEffect(() => {
    load();
  }, []);

  const usedCurrencies = [...new Set(accounts.map((a) => a.currency))].filter(
    (c) => c !== baseCurrency
  );
  const rateFor = (c: string) => rates.find((r) => r.currency === c);

  const save = async (currency: string, rate: number) => {
    if (!currency || !Number.isFinite(rate) || rate <= 0) return;
    await api.setRate(currency, rate);
    load();
  };
  const del = async (currency: string) => {
    await api.deleteRate(currency);
    load();
  };

  // Only relevant once there's a non-base currency in play.
  if (usedCurrencies.length === 0 && rates.length === 0) return null;

  return (
    <CollapsibleSection title="Exchange Rates">
      <p className="text-glass-3 -mt-2 mb-3 text-xs">
        Value of 1 unit of each currency in {baseCurrency}. Used to convert other-currency accounts
        into your base currency. Currencies without a rate are assumed 1:1.
      </p>
      <ul className="mb-4 divide-y divide-white/10">
        {usedCurrencies.map((c) => {
          const r = rateFor(c);
          return (
            <li key={c} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-glass">
                1 {c} ={" "}
                {r ? (
                  <span className="num">
                    {r.rate} {baseCurrency}
                  </span>
                ) : (
                  <span className="text-[#ffd60a]">no rate set (using 1:1)</span>
                )}
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  className="num w-28"
                  defaultValue={r?.rate ?? ""}
                  placeholder="rate"
                  onBlur={(e) => e.target.value && save(c, Number(e.target.value))}
                />
                {r && (
                  <button className="text-xs text-[#ff6b8a] hover:underline" onClick={() => del(c)}>
                    clear
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Currency">
          <select value={newCur} onChange={(e) => setNewCur(e.target.value)}>
            {CURRENCIES.filter((c) => c !== baseCurrency).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Rate (1 ${newCur} in ${baseCurrency})`}>
          <input
            type="number"
            step="0.0001"
            min="0"
            className="num w-32"
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
          />
        </Field>
        <Button
          variant="primary"
          onClick={() => {
            save(newCur, Number(newRate));
            setNewRate("");
          }}
        >
          Set Rate
        </Button>
      </div>
    </CollapsibleSection>
  );
}

function BackupManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const restore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("Restore will REPLACE all your current data with the backup. Continue?")) {
      e.target.value = "";
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const data = JSON.parse(await file.text());
      await api.restoreBackup(data);
      setMsg("Restored. Reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <CollapsibleSection title="Backup & Restore">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() =>
            api
              .downloadBackup()
              .then(() => toast.success("Backup downloaded."))
              .catch((e) => toast.error((e as Error).message))
          }
        >
          Download backup (JSON)
        </Button>
        <Button onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Restoring…" : "Restore from file…"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={restore}
        />
      </div>
      <p className="text-glass-3 mt-2 text-xs">
        Download a full copy of your data, or restore from a backup file. Restoring{" "}
        <span className="text-[#ff9bae]">replaces everything</span> currently in your account.
      </p>
      {msg && <div className="mt-2 text-sm text-[#64d2ff]">{msg}</div>}
    </CollapsibleSection>
  );
}

function ValuationsManager({
  accounts,
  format,
}: {
  accounts: Account[];
  format: (v: number) => string;
}) {
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [openFor, setOpenFor] = useState<string | null>(null);

  const load = () => {
    api.balances().then((b) => setBalances(b.accounts));
    api.listValuations().then(setValuations);
  };
  useEffect(load, [accounts.length]);

  const remove = async (id: string) => {
    await api.deleteValuation(id);
    load();
  };

  const nameById = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <CollapsibleSection title="Account Values">
      <p className="text-glass-3 -mt-2 mb-4 text-xs">
        Record what an account is really worth (e.g. an investment or pension pot) or correct a
        balance. The value applies from its date; later transactions and transfers adjust from
        there.
      </p>
      <ul className="mb-4 divide-y divide-white/10">
        {accounts.map((a) => {
          const bal = balances.find((b) => b.id === a.id)?.balance ?? 0;
          return (
            <li key={a.id} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-glass">{a.name}</span>
                <span className="flex items-center gap-3">
                  <span className="num text-glass-3">{format(bal)}</span>
                  <button
                    className="text-xs text-[#64d2ff] hover:underline"
                    onClick={() => setOpenFor(openFor === a.id ? null : a.id)}
                  >
                    update value
                  </button>
                </span>
              </div>
              {openFor === a.id && (
                <ValuationForm
                  accountId={a.id}
                  currentBalance={bal}
                  onSaved={() => {
                    setOpenFor(null);
                    load();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>

      {valuations.length > 0 && (
        <>
          <div className="mb-2 text-xs uppercase tracking-wider text-glass-3">Recent valuations</div>
          <ul className="divide-y divide-white/10">
            {valuations.slice(0, 8).map((v) => (
              <li key={v.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-glass-3">
                  <span className="text-glass">{nameById.get(v.accountId) ?? "—"}</span> ·{" "}
                  {new Date(v.date).toLocaleDateString("en-GB")}
                  {v.note && ` · ${v.note}`}
                </span>
                <span className="flex items-center gap-3">
                  <span className="num text-glass">{format(v.value)}</span>
                  <button
                    className="text-xs text-[#ff6b8a] hover:underline"
                    onClick={() => remove(v.id)}
                  >
                    delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </CollapsibleSection>
  );
}

function ValuationForm({
  accountId,
  currentBalance,
  onSaved,
}: {
  accountId: string;
  currentBalance: number;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [value, setValue] = useState(String(currentBalance));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    setBusy(true);
    try {
      await api.createValuation({ accountId, date: new Date(date).toISOString(), value: v, note: note || null });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-end gap-3">
      <Field label="As of date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Value">
        <input
          type="number"
          step="0.01"
          className="num w-32"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. statement" />
      </Field>
      <Button variant="primary" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save value"}
      </Button>
    </div>
  );
}

function CategoriesManager({
  categories,
  onChange,
}: {
  categories: Category[];
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<TxnType>("expense");
  const [color, setColor] = useState("#38bdf8");
  const [error, setError] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Name is required.");
    try {
      await api.createCategory({ name: name.trim(), type, color });
      setName("");
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteCategory(id);
      onChange();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const setTag = async (id: string, taxTag: TaxTag | null) => {
    await api.updateCategory(id, { taxTag });
    onChange();
  };

  const income = categories.filter((c) => c.type === "income");
  const expense = categories.filter((c) => c.type === "expense");

  return (
    <CollapsibleSection title="Categories">
      <p className="text-glass-3 -mt-2 mb-4 text-xs">
        Tag a category as Interest, Dividend or Gift Aid so it feeds the Tax tab.
      </p>
      <div className="mb-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <CategoryList title="Income" items={income} onRemove={remove} onSetTag={setTag} />
        <CategoryList title="Expense" items={expense} onRemove={remove} onSetTag={setTag} />
      </div>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Subscriptions" />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value as TxnType)}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </Field>
        <Field label="Color">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-16 p-1"
          />
        </Field>
        <Button type="submit" variant="primary">
          Add Category
        </Button>
      </form>
      {error && <div className="mt-2 text-sm text-[#ff6b8a]">{error}</div>}
    </CollapsibleSection>
  );
}

function CategoryList({
  title,
  items,
  onRemove,
  onSetTag,
}: {
  title: string;
  items: Category[];
  onRemove: (id: string) => void;
  onSetTag: (id: string, tag: TaxTag | null) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wider text-glass-3">{title}</div>
      <ul className="divide-y divide-white/10">
        {items.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-glass">
              <span
                className="inline-block h-[11px] w-[11px] shrink-0 rounded-[3px]"
                style={{ backgroundColor: c.color }}
              />
              <span className="truncate">{c.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <select
                aria-label="Tax tag"
                className="!px-2 !py-1 text-xs"
                value={c.taxTag ?? ""}
                onChange={(e) => onSetTag(c.id, (e.target.value || null) as TaxTag | null)}
              >
                <option value="">No tax tag</option>
                {c.type === "income" ? (
                  <>
                    <option value="interest">Interest</option>
                    <option value="dividend">Dividend</option>
                  </>
                ) : (
                  <option value="giftAid">Gift Aid</option>
                )}
              </select>
              <button className="text-xs text-[#ff6b8a] hover:underline" onClick={() => onRemove(c.id)}>
                delete
              </button>
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="py-2 text-xs text-glass-3">None yet.</li>}
      </ul>
    </div>
  );
}
