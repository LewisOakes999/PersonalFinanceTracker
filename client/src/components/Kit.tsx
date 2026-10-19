import { useEffect, useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link2, Plus, X } from "lucide-react";
import { api, type GearInput } from "../api/client";
import type { Gear, Transaction, Workout, WorkoutKind } from "../types";
import { Button, Field, Modal, SectionTitle, Tile } from "./ui";
import { KIND_ICONS } from "../lib/fitnessIcons";
import { KINDS, formatMinutes, isCardio } from "../lib/fitness";
import { kitStats, sessionWord, type KitStats } from "../lib/kit";
import { formatDate, formatCurrency } from "../lib/format";
import { useCurrency } from "../lib/CurrencyContext";
import { toast } from "../lib/toast";

const kmText = (km: number) => `${km >= 100 ? Math.round(km) : parseFloat(km.toFixed(1))} km`;

/** Everything the API needs to save a piece of kit as it is, with changes. */
const toInput = (g: Gear, change: Partial<GearInput> = {}): GearInput => ({
  name: g.name,
  kinds: g.kinds,
  transactionId: g.transactionId,
  price: g.price,
  boughtOn: g.boughtOn,
  startKm: g.startKm,
  lifespanKm: g.lifespanKm,
  retiredAt: g.retiredAt,
  ...change,
});

const kindsText = (kinds: WorkoutKind[]) => kinds.map((k) => KINDS.find((x) => x.id === k)?.label ?? k).join(" · ");

// ── The kit list ───────────────────────────────────────────────────────────

export function KitView({
  gear,
  workouts,
  onAdd,
  onEdit,
  onChanged,
}: {
  gear: Gear[];
  workouts: Workout[];
  onAdd: () => void;
  onEdit: (g: Gear) => void;
  onChanged: () => void;
}) {
  const stats = useMemo(() => gear.map((g) => kitStats(g, workouts)), [gear, workouts]);
  const active = stats.filter((s) => !s.gear.retiredAt);
  const retired = stats.filter((s) => s.gear.retiredAt);
  const { format } = useCurrency();

  const save = async (g: Gear, change: Partial<GearInput>, done: string) => {
    try {
      await api.updateGear(g.id, toInput(g, change));
      toast.success(done);
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  const remove = async (g: Gear) => {
    if (!confirm(`Delete “${g.name}”? Workouts logged with it stay, without the link.`)) return;
    try {
      await api.deleteGear(g.id);
      toast.success("Kit deleted.");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (gear.length === 0) {
    return (
      <Tile className="p-[22px]">
        <SectionTitle>Kit</SectionTitle>
        <p className="text-glass-3 max-w-xl text-sm">
          Add your running shoes, bike or other kit, and link the purchase from your spending. Pick it when you log a
          workout, and you'll see how far it's gone, what it's cost per km and when it's due for replacing.
        </p>
        <Button variant="primary" className="mt-4 inline-flex items-center gap-1.5" onClick={onAdd}>
          <Plus size={14} strokeWidth={2} /> Add kit
        </Button>
      </Tile>
    );
  }

  return (
    <>
      {active.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {active.map((s) => (
            <KitCard
              key={s.gear.id}
              s={s}
              format={format}
              onEdit={() => onEdit(s.gear)}
              onRetire={() => save(s.gear, { retiredAt: new Date().toISOString().slice(0, 10) }, `Retired “${s.gear.name}”.`)}
            />
          ))}
        </div>
      )}

      {retired.length > 0 && (
        <Tile className="p-[22px]">
          <SectionTitle>Retired</SectionTitle>
          <ul className="divide-y divide-white/10">
            {retired.map((s) => (
              <li key={s.gear.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="text-glass block truncate">{s.gear.name}</span>
                  <span className="text-glass-3 num block text-xs">
                    {s.km > 0 && `${kmText(s.km)} · `}
                    {s.costPerKm !== null && `${format(s.costPerKm)}/km · `}
                    {s.sessions} {sessionWord(s.gear.kinds)}
                    {s.sessions === 1 ? "" : "s"} · retired {formatDate(s.gear.retiredAt!)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-3 text-xs">
                  <button
                    className="text-[color:var(--accent-soft)] hover:underline"
                    onClick={() => save(s.gear, { retiredAt: null }, `“${s.gear.name}” is back in use.`)}
                  >
                    bring back
                  </button>
                  <button className="text-[#ff6b8a] hover:underline" onClick={() => remove(s.gear)}>
                    delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Tile>
      )}
    </>
  );
}

function KitCard({
  s,
  format,
  onEdit,
  onRetire,
}: {
  s: KitStats;
  format: (v: number) => string;
  onEdit: () => void;
  onRetire: () => void;
}) {
  const g = s.gear;
  const Icon = KIND_ICONS[g.kinds[0] ?? "other"];
  const distanceKit = g.kinds.some(isCardio);
  const word = sessionWord(g.kinds);
  const wearPct = s.wear !== null ? Math.min(100, Math.round(s.wear * 100)) : null;
  const worn = s.wear !== null && s.wear >= 1;
  const nearlyWorn = s.wear !== null && s.wear >= 0.9;

  return (
    <Tile className="p-[22px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent-rgb)/0.15)] text-[color:var(--accent-soft)]">
            <Icon size={17} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="text-glass truncate text-[15px] font-semibold">{g.name}</div>
            <div className="text-glass-3 text-xs">{kindsText(g.kinds)}</div>
          </div>
        </div>
        <div className="flex shrink-0 gap-3 text-xs">
          <button className="text-[color:var(--accent-soft)] hover:underline" onClick={onEdit}>
            edit
          </button>
          <button className="text-glass-3 hover:text-glass hover:underline" onClick={onRetire}>
            retire
          </button>
        </div>
      </div>

      <div className={`mt-4 grid gap-4 ${distanceKit ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
        {distanceKit && (
          <Figure
            label="Distance"
            value={kmText(s.km)}
            sub={g.startKm > 0 ? `${kmText(g.startKm)} before logging` : undefined}
          />
        )}
        {distanceKit && (
          <Figure
            label="Cost per km"
            value={s.costPerKm !== null ? format(s.costPerKm) : "—"}
            sub={g.price === null ? "add what it cost" : s.km === 0 ? "no distance yet" : undefined}
            accent={s.costPerKm !== null}
          />
        )}
        <Figure
          label={`${word[0].toUpperCase()}${word.slice(1)}s`}
          value={String(s.sessions)}
          sub={s.seconds > 0 ? formatMinutes(s.seconds) : undefined}
        />
        <Figure
          label={`Per ${word}`}
          value={s.costPerSession !== null ? format(s.costPerSession) : "—"}
          accent={!distanceKit && s.costPerSession !== null}
        />
      </div>

      {wearPct !== null && (
        <div className="mt-4">
          <div className="glass-nested h-2 w-full overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full ${nearlyWorn ? "bg-warn" : "bg-[rgb(var(--accent-rgb))]"}`}
              style={{ width: `${wearPct}%` }}
            />
          </div>
          <p className={`mt-1.5 text-xs ${nearlyWorn ? "text-warn" : "text-glass-3"}`}>
            {worn
              ? `Past its ${g.lifespanKm} km. Time to think about a new pair?`
              : `${kmText(s.kmLeft!)} left of ${g.lifespanKm} km`}
            {!worn && s.replaceOn && (
              <span className="text-glass-3">
                {" "}
                · replace around {formatDate(s.replaceOn)} at {kmText(s.kmPerWeek!)} a week
              </span>
            )}
          </p>
        </div>
      )}

      <div className="text-glass-3 mt-4 space-y-0.5 border-t border-white/10 pt-3 text-xs">
        {g.price !== null || g.boughtOn ? (
          <div>
            Bought
            {g.boughtOn && ` ${formatDate(g.boughtOn)}`}
            {g.price !== null && ` for ${format(g.price)}`}
            {g.transaction && (
              <span className="ml-1 inline-flex items-center gap-1">
                <Link2 size={11} strokeWidth={2} className="text-[color:var(--accent-soft)]" />
                {g.transaction.description || "purchase"}, {g.transaction.account.name}
              </span>
            )}
          </div>
        ) : (
          <div>No price yet. Link the purchase to see what it costs per {distanceKit ? "km" : word}.</div>
        )}
        {s.lastUsed && <div>Last used {formatDate(s.lastUsed)}</div>}
      </div>
    </Tile>
  );
}

function Figure({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-glass-3 text-[11px] font-medium uppercase tracking-[0.08em]">{label}</div>
      <div
        className="num mt-1 text-[20px] font-semibold tracking-tight"
        style={{ color: accent ? "var(--accent-soft)" : "var(--lg-text)" }}
      >
        {value}
      </div>
      {sub && <div className="text-glass-3 mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}

// ── Adding and editing kit ─────────────────────────────────────────────────

type Purchase = NonNullable<Gear["transaction"]>;
const purchaseOf = (t: Transaction): Purchase => ({
  id: t.id,
  date: t.date,
  amount: t.amount,
  description: t.description,
  account: { name: t.account.name, currency: t.account.currency },
});

export function KitModal({ gear, onClose, onSaved }: { gear: Gear | null; onClose: () => void; onSaved: (g: Gear) => void }) {
  const [name, setName] = useState(gear?.name ?? "");
  const [kinds, setKinds] = useState<WorkoutKind[]>(gear?.kinds ?? ["run"]);
  const [purchase, setPurchase] = useState<Purchase | null>(gear?.transaction ?? null);
  const [price, setPrice] = useState(gear?.price != null ? String(gear.price) : "");
  const [boughtOn, setBoughtOn] = useState(gear?.boughtOn?.slice(0, 10) ?? "");
  const [startKm, setStartKm] = useState(gear?.startKm ? String(gear.startKm) : "");
  const [lifespan, setLifespan] = useState(gear?.lifespanKm ? String(gear.lifespanKm) : "");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Transaction[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const kindsLabel = useId();
  const searchId = useId();

  // Search your spending as you type, newest first.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .listTransactions({ type: "expense", search: q })
        .then((ts) => setResults(ts.slice(0, 8)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const link = (t: Transaction) => {
    const p = purchaseOf(t);
    // Fill in what the purchase knows, unless you've typed something else.
    if (!price.trim() || (purchase && Number(price) === purchase.amount)) setPrice(String(p.amount));
    if (!boughtOn || (purchase && boughtOn === purchase.date.slice(0, 10))) setBoughtOn(p.date.slice(0, 10));
    if (!name.trim()) setName(p.description);
    setPurchase(p);
    setQuery("");
    setResults([]);
  };

  const toggleKind = (k: WorkoutKind) =>
    setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give it a name.");
    if (kinds.length === 0) return setError("Pick at least one kind of workout it's for.");
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    const p = num(price);
    if (p !== null && (!Number.isFinite(p) || p < 0)) return setError("Enter what it cost.");
    const start = num(startKm) ?? 0;
    if (!Number.isFinite(start) || start < 0) return setError("Enter the distance already on it in km.");
    const life = num(lifespan);
    if (life !== null && (!Number.isInteger(life) || life < 1)) return setError("Enter when to replace it in whole km.");
    const input: GearInput = {
      name: name.trim(),
      kinds,
      transactionId: purchase?.id ?? null,
      price: p,
      boughtOn: boughtOn ? new Date(boughtOn).toISOString() : null,
      startKm: start,
      lifespanKm: life,
      retiredAt: gear?.retiredAt ?? null,
    };
    setSaving(true);
    try {
      onSaved(gear ? await api.updateGear(gear.id, input) : await api.createGear(input));
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const forRunning = kinds.includes("run") || kinds.includes("walk");

  return (
    <Modal title={gear ? "Edit Kit" : "Add Kit"} onClose={onClose} opaque>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input
            className="w-full"
            placeholder={forRunning ? "e.g. Nike Pegasus 41" : "e.g. Road bike"}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <div role="group" aria-labelledby={kindsLabel}>
          <span id={kindsLabel} className="text-glass-3 mb-1 block text-xs uppercase tracking-wider">
            Used for
          </span>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => {
              const Icon = KIND_ICONS[k.id];
              const on = kinds.includes(k.id);
              return (
                <button
                  key={k.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleKind(k.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    on
                      ? "border-[rgb(var(--accent-rgb)/0.6)] bg-[rgb(var(--accent-rgb)/0.18)] text-white"
                      : "border-white/10 bg-white/5 text-glass-3 hover:text-glass"
                  }`}
                >
                  <Icon size={13} strokeWidth={1.75} /> {k.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor={searchId} className="text-glass-3 mb-1 block text-xs uppercase tracking-wider">
            The purchase, from your spending
          </label>
          {purchase ? (
            <div className="glass-nested flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Link2 size={14} strokeWidth={2} className="shrink-0 text-[color:var(--accent-soft)]" />
                <span className="min-w-0">
                  <span className="text-glass block truncate">{purchase.description || "Purchase"}</span>
                  <span className="text-glass-3 num block text-xs">
                    {formatDate(purchase.date)} · {purchase.account.name} ·{" "}
                    {formatCurrency(purchase.amount, purchase.account.currency)}
                  </span>
                </span>
              </span>
              <button
                type="button"
                className="text-glass-3 hover:text-glass shrink-0 p-1"
                aria-label="Unlink the purchase"
                onClick={() => setPurchase(null)}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <input
                id={searchId}
                className="w-full"
                placeholder="Search, e.g. Nike or Runners Need"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              {results.length > 0 && (
                <ul className="glass-nested mt-2 max-h-56 overflow-y-auto rounded-xl py-1">
                  {results.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => link(t)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-white/[0.06]"
                      >
                        <span className="min-w-0">
                          <span className="text-glass block truncate">{t.description || t.category.name}</span>
                          <span className="text-glass-3 block text-xs">
                            {formatDate(t.date)} · {t.account.name} · {t.category.name}
                          </span>
                        </span>
                        <span className="num text-glass shrink-0">{formatCurrency(t.amount, t.account.currency)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-glass-3 mt-1 text-xs">
                {searching
                  ? "Searching…"
                  : query.trim().length >= 2 && results.length === 0
                    ? "Nothing matches. You can still enter the price below."
                    : "Optional. Linking it fills in the price and date."}
              </p>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Price">
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="num w-full"
              placeholder="e.g. 120"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Bought on">
            <input type="date" className="w-full" value={boughtOn} onChange={(e) => setBoughtOn(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Already done (km)">
            <input
              type="number"
              min="0"
              step="0.1"
              inputMode="decimal"
              className="num w-full"
              placeholder="0"
              value={startKm}
              onChange={(e) => setStartKm(e.target.value)}
            />
          </Field>
          <Field label="Replace after (km)">
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              className="num w-full"
              placeholder={forRunning ? "e.g. 650" : "optional"}
              value={lifespan}
              onChange={(e) => setLifespan(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-glass-3 -mt-2 text-xs">
          {forRunning
            ? "Running shoes usually last 500–800 km. Add the distance already on them if they're not new."
            : "Add any distance it had already done before you started logging it."}
        </p>

        {error && <div className="text-sm text-[#ff6b8a]">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : gear ? "Save" : "Add Kit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
