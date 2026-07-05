import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { api } from "../api/client";
import type {
  Account,
  AccountBalance,
  Asset,
  Category,
  CategoryRule,
  ExchangeRate,
  Liability,
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
import {
  CURRENCIES,
  formatCurrency,
  formatDate,
  nextInterestDate,
  termLabel,
  toDateInput,
} from "../lib/format";
import { RISK_PROFILES, matchProfile, riskHint } from "../lib/riskProfiles";
import { useCurrency } from "../lib/CurrencyContext";
import { applyTheme, getTheme, type Theme } from "../lib/theme";
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

const INTEREST_FREQ: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
  { value: "maturity", label: "At maturity" },
];

/** Optional fixed-term fields (start, maturity, when interest is paid). */
function TermFields({
  start,
  maturity,
  interestPaid,
  onStart,
  onMaturity,
  onInterestPaid,
}: {
  start: string;
  maturity: string;
  interestPaid: string;
  onStart: (v: string) => void;
  onMaturity: (v: string) => void;
  onInterestPaid: (v: string) => void;
}) {
  return (
    <>
      <Field label="Start date">
        <input type="date" className="num" value={start} onChange={(e) => onStart(e.target.value)} />
      </Field>
      <Field label="Maturity date">
        <input type="date" className="num" value={maturity} onChange={(e) => onMaturity(e.target.value)} />
      </Field>
      <Field label="Interest paid">
        <select value={interestPaid} onChange={(e) => onInterestPaid(e.target.value)}>
          {INTEREST_FREQ.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </Field>
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

      <AppearanceManager />
      <RatesManager accounts={accounts} baseCurrency={currency} />
      <SecurityManager />
      <BackupManager />
      <AccountsManager accounts={accounts} onChange={loadAccounts} format={format} />
      <AssetsManager />
      <LiabilitiesManager />
      <ValuationsManager accounts={accounts} format={format} />
      <CategoriesManager categories={categories} onChange={loadCategories} />
      <CategoryRulesManager categories={categories} />
    </div>
  );
}

/** Auto-categorisation rules: keyword in description → category. */
function CategoryRulesManager({ categories }: { categories: Category[] }) {
  const [rules, setRules] = useState<CategoryRule[]>([]);
  const [match, setMatch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [onlyUncat, setOnlyUncat] = useState(true);
  const [applying, setApplying] = useState(false);

  const load = () => api.listCategoryRules().then(setRules);
  useEffect(() => {
    load();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!match.trim() || !categoryId) return;
    try {
      await api.createCategoryRule({ match: match.trim(), categoryId });
      setMatch("");
      setCategoryId("");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteCategoryRule(id);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const apply = async () => {
    setApplying(true);
    try {
      const res = await api.applyCategoryRules(onlyUncat);
      toast.success(`Recategorised ${res.updated} transaction(s).`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setApplying(false);
    }
  };

  return (
    <CollapsibleSection title="Category Rules">
      <p className="text-glass-3 mb-4 text-xs">
        Automatically categorise transactions whose description contains a keyword. Applied to CSV
        imports that don't specify a category, and to existing transactions on demand.
      </p>
      {rules.length > 0 ? (
        <ul className="mb-4 divide-y divide-white/10">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="text-glass-2">
                contains <b className="text-glass">“{r.match}”</b> <span className="text-glass-3">→</span>{" "}
                <span className="inline-flex items-center gap-1 text-glass">
                  <span
                    className="inline-block h-[10px] w-[10px] rounded-[3px]"
                    style={{ backgroundColor: r.category.color }}
                  />
                  {r.category.name}
                </span>
              </span>
              <button className="text-xs text-[#ff6b8a] hover:underline" onClick={() => remove(r.id)}>
                delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-glass-3 mb-4 text-sm">No rules yet. Add one below.</p>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <Field label="When description contains">
          <input value={match} onChange={(e) => setMatch(e.target.value)} placeholder="e.g. tesco" />
        </Field>
        <Field label="Category">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" variant="primary">
          Add Rule
        </Button>
      </form>
      {rules.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          <Button onClick={apply} disabled={applying}>
            {applying ? "Applying…" : "Apply rules to existing transactions"}
          </Button>
          <label className="text-glass-3 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={onlyUncat} onChange={(e) => setOnlyUncat(e.target.checked)} />
            only uncategorised
          </label>
        </div>
      )}
    </CollapsibleSection>
  );
}

function AppearanceManager() {
  const [theme, setTheme] = useState<Theme>(getTheme());
  const choose = (t: Theme) => {
    setTheme(t);
    applyTheme(t);
  };
  return (
    <CollapsibleSection title="Appearance">
      <p className="text-glass-3 mb-3 text-xs">
        Choose a colour theme. Applies instantly and is remembered on this device.
      </p>
      <div className="flex gap-2">
        {(["dark", "light"] as Theme[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => choose(t)}
            className={`rounded-xl border px-4 py-2 text-sm transition-colors ${
              theme === t
                ? "border-[rgba(10,132,255,0.5)] bg-[rgba(10,132,255,0.18)] text-white"
                : "border-white/10 bg-white/5 text-glass hover:bg-white/10"
            }`}
          >
            {t === "dark" ? "🌙 Dark" : "☀️ Light"}
          </button>
        ))}
      </div>
    </CollapsibleSection>
  );
}

const ASSET_TYPES = ["property", "vehicle", "valuables", "cash", "other"];

/** Manage non-account assets (property, vehicles…) that count toward net worth. */
function AssetsManager() {
  const [items, setItems] = useState<Asset[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("property");
  const [currency, setCurrency] = useState("GBP");
  const [value, setValue] = useState("");

  const load = () => api.listAssets().then(setItems);
  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setEditing(null);
    setName("");
    setType("property");
    setCurrency("GBP");
    setValue("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const data = { name: name.trim(), type, currency, value: Number(value) || 0 };
    try {
      if (editing) await api.updateAsset(editing, data);
      else await api.createAsset(data);
      reset();
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const edit = (a: Asset) => {
    setEditing(a.id);
    setName(a.name);
    setType(a.type);
    setCurrency(a.currency);
    setValue(String(a.value));
  };

  const remove = async (a: Asset) => {
    if (!confirm(`Delete “${a.name}”?`)) return;
    try {
      await api.deleteAsset(a.id);
      if (editing === a.id) reset();
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <CollapsibleSection title="Other Assets">
      <p className="text-glass-3 mb-4 text-xs">
        Property, vehicles, valuables and anything else you own that isn't a bank account. Their value
        is added to your net worth.
      </p>
      {items.length > 0 ? (
        <ul className="mb-4 divide-y divide-white/10">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="text-glass font-medium">{a.name}</span>{" "}
                <span className="text-glass-3 text-xs uppercase tracking-wide">{a.type}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="num text-glass-2 text-[13px]">{formatCurrency(a.value, a.currency)}</span>
                <button className="text-xs text-[#64d2ff] hover:underline" onClick={() => edit(a)}>
                  edit
                </button>
                <button className="text-xs text-[#ff6b8a] hover:underline" onClick={() => remove(a)}>
                  delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-glass-3 mb-4 text-sm">No other assets yet. Add one below.</p>
      )}
      <form onSubmit={submit} data-tour="add-asset" className="flex flex-wrap items-end gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home" />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {ASSET_TYPES.map((t) => (
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
        <Field label="Value">
          <input
            type="number"
            step="0.01"
            className="num w-32"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary">
          {editing ? "Update" : "Add"} Asset
        </Button>
        {editing && (
          <Button type="button" onClick={reset}>
            Cancel
          </Button>
        )}
      </form>
    </CollapsibleSection>
  );
}

const LIABILITY_TYPES = ["loan", "mortgage", "lease", "credit", "other"];

/** Manage debts (loans, mortgages, leases…) that count against net worth. */
function LiabilitiesManager() {
  const [items, setItems] = useState<Liability[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("loan");
  const [currency, setCurrency] = useState("GBP");
  const [balance, setBalance] = useState("");
  const [rate, setRate] = useState("");
  const [payment, setPayment] = useState("");

  const load = () => api.listLiabilities().then(setItems);
  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setEditing(null);
    setName("");
    setType("loan");
    setCurrency("GBP");
    setBalance("");
    setRate("");
    setPayment("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const data = {
      name: name.trim(),
      type,
      currency,
      balance: Number(balance) || 0,
      interestRate: Number(rate) || 0,
      monthlyPayment: Number(payment) || 0,
    };
    try {
      if (editing) await api.updateLiability(editing, data);
      else await api.createLiability(data);
      reset();
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const edit = (l: Liability) => {
    setEditing(l.id);
    setName(l.name);
    setType(l.type);
    setCurrency(l.currency);
    setBalance(String(l.balance));
    setRate(String(l.interestRate));
    setPayment(String(l.monthlyPayment));
  };

  const remove = async (l: Liability) => {
    if (!confirm(`Delete “${l.name}”?`)) return;
    try {
      await api.deleteLiability(l.id);
      if (editing === l.id) reset();
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <CollapsibleSection title="Liabilities">
      <p className="text-glass-3 mb-4 text-xs">
        Loans, mortgages, leases and other debts. Their outstanding balances are subtracted from your
        net worth.
      </p>
      {items.length > 0 ? (
        <ul className="mb-4 divide-y divide-white/10">
          {items.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="text-glass font-medium">{l.name}</span>{" "}
                <span className="text-glass-3 text-xs uppercase tracking-wide">{l.type}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="num text-glass-2 text-[13px]">
                  {formatCurrency(l.balance, l.currency)}
                  {l.interestRate ? <span className="text-glass-3"> · {l.interestRate}%</span> : null}
                  {l.monthlyPayment ? (
                    <span className="text-glass-3"> · {formatCurrency(l.monthlyPayment, l.currency)}/mo</span>
                  ) : null}
                </span>
                <button className="text-xs text-[#64d2ff] hover:underline" onClick={() => edit(l)}>
                  edit
                </button>
                <button className="text-xs text-[#ff6b8a] hover:underline" onClick={() => remove(l)}>
                  delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-glass-3 mb-4 text-sm">No liabilities yet. Add one below.</p>
      )}
      <form onSubmit={submit} data-tour="add-liability" className="flex flex-wrap items-end gap-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Home Mortgage" />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {LIABILITY_TYPES.map((t) => (
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
        <Field label="Balance owed">
          <input
            type="number"
            step="0.01"
            className="num w-32"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </Field>
        <Field label="Interest %">
          <input
            type="number"
            step="0.01"
            className="num w-24"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </Field>
        <Field label="Monthly payment">
          <input
            type="number"
            step="0.01"
            className="num w-32"
            value={payment}
            onChange={(e) => setPayment(e.target.value)}
          />
        </Field>
        <Button type="submit" variant="primary">
          {editing ? "Update" : "Add"} Liability
        </Button>
        {editing && (
          <Button type="button" onClick={reset}>
            Cancel
          </Button>
        )}
      </form>
    </CollapsibleSection>
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
  const [termStart, setTermStart] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [interestPaid, setInterestPaid] = useState("");
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
      termStart: termStart || null,
      maturityDate: maturityDate || null,
      interestPaid: interestPaid || null,
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
    setTermStart("");
    setMaturityDate("");
    setInterestPaid("");
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
        <TermFields
          start={termStart}
          maturity={maturityDate}
          interestPaid={interestPaid}
          onStart={setTermStart}
          onMaturity={setMaturityDate}
          onInterestPaid={setInterestPaid}
        />
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
  const [termStart, setTermStart] = useState(toDateInput(account.termStart));
  const [maturityDate, setMaturityDate] = useState(toDateInput(account.maturityDate));
  const [interestPaid, setInterestPaid] = useState(account.interestPaid ?? "");

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
      termStart: termStart || null,
      maturityDate: maturityDate || null,
      interestPaid: interestPaid || null,
    });
    setEditing(false);
    onChange();
  };

  if (!editing) {
    return (
      <li className="flex items-start justify-between gap-3 py-2 text-sm">
        <span className="min-w-0">
          <span className="flex items-center gap-2 text-glass">
            {account.name}
            <span className="text-xs uppercase tracking-wider text-glass-3">{account.type}</span>
            {account.isIsa && <IsaBadge />}
            {account.isPremiumBonds && <PbBadge />}
            {account.isInvestment && <InvestmentBadge />}
            {account.isPension && <PensionBadge />}
          </span>
          {account.maturityDate && (
            <span className="text-glass-3 mt-0.5 block text-xs">
              {termLabel(account.termStart, account.maturityDate) &&
                `${termLabel(account.termStart, account.maturityDate)} · `}
              matures {formatDate(account.maturityDate)}
              {nextInterestDate(account) &&
                ` · interest ${formatDate(nextInterestDate(account)!)}`}
            </span>
          )}
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
        <TermFields
          start={termStart}
          maturity={maturityDate}
          interestPaid={interestPaid}
          onStart={setTermStart}
          onMaturity={setMaturityDate}
          onInterestPaid={setInterestPaid}
        />
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
  const [refreshing, setRefreshing] = useState(false);

  const load = () => api.listRates().then(setRates);
  useEffect(() => {
    load();
  }, []);

  const refreshLive = async () => {
    setRefreshing(true);
    try {
      const res = await api.refreshRates();
      await load();
      toast.success(
        res.updated > 0
          ? `Updated ${res.updated} rate(s) to live${res.asOf ? ` (as of ${res.asOf})` : ""}.`
          : "No non-base currencies to update."
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRefreshing(false);
    }
  };

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
      <p className="text-glass-3 mb-3 text-xs">
        Value of 1 unit of each currency in {baseCurrency}. Used to convert other-currency accounts
        into your base currency. Currencies without a rate are assumed 1:1.
      </p>
      <div className="mb-3">
        <Button onClick={refreshLive} disabled={refreshing}>
          {refreshing ? "Fetching…" : "↻ Fetch live rates"}
        </Button>
      </div>
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
      <p className="text-glass-3 mb-4 text-xs">
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
      <p className="text-glass-3 mb-4 text-xs">
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
