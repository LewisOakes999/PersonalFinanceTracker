import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus } from "lucide-react";
import { api } from "../api/client";
import type {
  InvestmentAccountPerformance,
  InvestmentPerformance,
  PerformancePoint,
  Valuation,
} from "../types";
import {
  Button,
  Field,
  InvestmentBadge,
  IsaBadge,
  Modal,
  PensionBadge,
  SectionTitle,
  StatTile,
  Tile,
} from "../components/ui";
import { formatCurrency, formatDate } from "../lib/format";
import { fittedAxis } from "../lib/chart";
import { useCurrency } from "../lib/CurrencyContext";
import { toast } from "../lib/toast";
import { tooltipStyle } from "./Dashboard";
import InvestmentProjection from "./InvestmentProjection";

const ACTUAL = "#34e0c4";
const LOSS = "#ff6b8a";
const MEDIAN = "#64d2ff";
const BAND = "#0a84ff";
const PUT_IN = "rgba(245,245,247,0.55)";
const AXIS = "rgba(245,245,247,0.45)";

const signed = (v: number, fmt: (n: number) => string) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

const POSITION_TEXT = {
  above: "above the forecast range",
  within: "within the forecast range",
  below: "below the forecast range",
} as const;

export default function Investments({ onManageAccounts }: { onManageAccounts?: () => void } = {}) {
  const { format } = useCurrency();
  const [data, setData] = useState<InvestmentPerformance | null>(null);
  // Open the record-value modal: for an account (new value) or an existing value (edit).
  const [recording, setRecording] = useState<{ accountId?: string; valuation?: Valuation } | null>(
    null
  );

  const load = () =>
    api
      .investmentPerformance()
      .then(setData)
      .catch((e) => toast.error((e as Error).message));
  useEffect(() => {
    load();
  }, []);

  const removeValue = async (v: Valuation) => {
    if (!confirm(`Delete the value recorded on ${formatDate(v.date)}?`)) return;
    try {
      await api.deleteValuation(v.id);
      toast.success("Value deleted.");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const accounts = data?.accounts ?? [];
  const t = data?.totals;

  return (
    <div className="space-y-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">Investments</h1>
          <p className="text-glass-3 mt-1 text-[13px]">
            How your investments have done against the forecast, and where they're heading
          </p>
        </div>
        {accounts.length > 0 && (
          <Button
            variant="primary"
            className="inline-flex items-center gap-1.5"
            onClick={() => setRecording({})}
          >
            <Plus size={14} strokeWidth={2} /> Record Value
          </Button>
        )}
      </header>

      {data && accounts.length === 0 && (
        <Tile className="p-[22px]">
          <SectionTitle>No investment accounts yet</SectionTitle>
          <p className="text-glass-3 text-sm">
            Tick <span className="text-glass">Investment</span> or{" "}
            <span className="text-glass">Pension</span> on an account in Settings, with an expected
            return and volatility, and it will be tracked here.
          </p>
          {onManageAccounts && (
            <Button className="mt-4" onClick={onManageAccounts}>
              Go to accounts
            </Button>
          )}
        </Tile>
      )}

      {t && accounts.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
          <StatTile
            label="Worth"
            value={format(t.value)}
            tone="accent"
            sub={`${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
          />
          <StatTile label="Put in" value={format(t.contributed)} sub="money in, less money out" />
          <StatTile
            label="Gain / loss"
            value={t.valuedCount > 0 ? signed(t.gain, format) : "—"}
            tone={t.valuedCount === 0 ? "default" : t.gain >= 0 ? "income" : "expense"}
            sub={
              t.valuedCount === 0
                ? "record a value to see"
                : `${signed(t.contributedValued > 0 ? (t.gain / t.contributedValued) * 100 : 0, (n) => `${n.toFixed(1)}%`)} on what was put in${
                    t.valuedCount < accounts.length
                      ? ` · ${accounts.length - t.valuedCount} not valued yet`
                      : ""
                  }`
            }
          />
          <StatTile
            label="Vs forecast"
            value={t.valuedCount > 0 ? signed(t.vsForecast, format) : "—"}
            tone={t.valuedCount === 0 ? "default" : t.vsForecast >= 0 ? "income" : "expense"}
            sub={
              t.valuedCount === 0
                ? "record a value to compare"
                : t.vsForecast >= 0
                  ? "ahead of the forecast median"
                  : "behind the forecast median"
            }
          />
        </div>
      )}

      {accounts.map((a) => (
        <AccountPerformance
          key={a.id}
          a={a}
          onRecord={() => setRecording({ accountId: a.id })}
          onEdit={(v) => setRecording({ accountId: a.id, valuation: v })}
          onDelete={removeValue}
        />
      ))}

      {accounts.length > 0 && <InvestmentProjection />}

      {recording && data && (
        <RecordValueModal
          accounts={accounts}
          accountId={recording.accountId}
          valuation={recording.valuation}
          onClose={() => setRecording(null)}
          onSaved={() => {
            setRecording(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function AccountPerformance({
  a,
  onRecord,
  onEdit,
  onDelete,
}: {
  a: InvestmentAccountPerformance;
  onRecord: () => void;
  onEdit: (v: Valuation) => void;
  onDelete: (v: Valuation) => void;
}) {
  const fmt = (n: number) => formatCurrency(n, a.currency);
  const gainColor = a.gain === null ? undefined : a.gain >= 0 ? ACTUAL : LOSS;
  const vsColor = a.vsForecast === null ? undefined : a.vsForecast >= 0 ? ACTUAL : LOSS;

  // Money put in by each recorded value's date — so each row shows its own gain.
  const contributedAt = useMemo(() => {
    const byT = new Map(a.series.map((p) => [p.t, p.contributed]));
    return (date: string) => byT.get(new Date(date).getTime());
  }, [a.series]);

  return (
    <Tile className="p-[22px]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-glass text-[15px] font-semibold">{a.name}</h2>
            {a.isIsa && <IsaBadge />}
            {a.isInvestment && <InvestmentBadge />}
            {a.isPension && <PensionBadge />}
          </div>
          <p className="text-glass-3 num mt-0.5 text-xs">
            Forecast {a.expectedReturn.toFixed(1)}% a year · {a.volatility.toFixed(0)}% volatility ·
            tracked since {formatDate(a.since)}
          </p>
        </div>
        <Button className="inline-flex items-center gap-1.5" onClick={onRecord}>
          <Plus size={13} strokeWidth={2} /> Record value
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
        <Metric
          label="Worth"
          value={fmt(a.value)}
          sub={
            a.valuedAt
              ? `valued ${formatDate(a.valuedAt)}${
                  a.addedSinceValuation !== 0 ? ` · ${signed(a.addedSinceValuation, fmt)} since` : ""
                }`
              : "not valued yet — this is what went in"
          }
        />
        <Metric label="Put in" value={fmt(a.contributed)} />
        <Metric
          label="Gain / loss"
          value={a.gain === null ? "—" : signed(a.gain, fmt)}
          color={gainColor}
          sub={
            a.gainPct !== null
              ? `${signed(a.gainPct, (n) => `${n.toFixed(1)}%`)} on ${fmt(a.contributedAtValuation!)}`
              : undefined
          }
        />
        <Metric
          label="Vs forecast"
          value={a.vsForecast === null ? "—" : signed(a.vsForecast, fmt)}
          color={vsColor}
          sub={
            a.forecast && a.position
              ? `forecast ${fmt(a.forecast.p50)} · ${POSITION_TEXT[a.position]}`
              : undefined
          }
        />
      </div>

      <PerformanceChart a={a} fmt={fmt} />

      {a.valuations.length === 0 ? (
        <div className="glass-nested mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3">
          <p className="text-glass-3 text-xs">
            Record what this account is worth — from your provider's app or a statement — to see how
            it has actually done against the forecast.
          </p>
          <Button variant="primary" onClick={onRecord}>
            Record first value
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <div className="text-glass-3 mb-1 text-[11px] font-medium uppercase tracking-[0.08em]">
            Recorded values
          </div>
          <ul className="divide-y divide-white/10">
            {a.valuations.map((v) => {
              const putIn = contributedAt(v.date);
              const gain = putIn === undefined ? null : v.value - putIn;
              return (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="num text-glass-2 whitespace-nowrap">{formatDate(v.date)}</span>
                    <span className="text-glass-3 block text-xs">
                      {gain !== null && (
                        <span className="num" style={{ color: gain >= 0 ? ACTUAL : LOSS }}>
                          {signed(gain, fmt)} {gain >= 0 ? "gain" : "loss"}
                        </span>
                      )}
                      {gain !== null && v.note && " · "}
                      {v.note}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="num text-glass">{fmt(v.value)}</span>
                    <button className="text-xs text-[#64d2ff] hover:underline" onClick={() => onEdit(v)}>
                      edit
                    </button>
                    <button className="text-xs text-[#ff6b8a] hover:underline" onClick={() => onDelete(v)}>
                      delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Tile>
  );
}

function Metric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-glass-3 text-[11px] font-medium uppercase tracking-[0.08em]">{label}</div>
      <div className="num mt-1 text-[18px] font-semibold" style={{ color: color ?? "var(--lg-text)" }}>
        {value}
      </div>
      {sub && <div className="text-glass-3 mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}

/** Month-start ticks across the range, thinned so they don't crowd. */
function timeTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const d = new Date(min);
  const cur = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  while (cur.getTime() <= max) {
    ticks.push(cur.getTime());
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  if (ticks.length === 0) return [min, max];
  const step = Math.ceil(ticks.length / 7);
  return ticks.filter((_, i) => i % step === 0);
}

function PerformanceChart({
  a,
  fmt,
}: {
  a: InvestmentAccountPerformance;
  fmt: (n: number) => string;
}) {
  // A range area ([low, high] per point) draws the p10–p90 band without a zero
  // baseline, so the axis can fit the data instead of starting at £0.
  const data = useMemo(
    () => a.series.map((p) => ({ ...p, range: [p.p10, p.p90] as [number, number] })),
    [a.series]
  );
  const min = data[0]?.t ?? 0;
  const max = data[data.length - 1]?.t ?? 0;
  const yAxis = fittedAxis(
    data.flatMap((p) => [p.contributed, p.p10, p.p90, ...(p.actual !== undefined ? [p.actual] : [])])
  );
  const actualColor = a.gain !== null && a.gain < 0 ? LOSS : ACTUAL;

  return (
    <div>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id={`band-${a.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BAND} stopOpacity={0.3} />
                <stop offset="100%" stopColor={BAND} stopOpacity={0.12} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[min, max]}
              ticks={timeTicks(min, max)}
              tickFormatter={(t: number) =>
                new Date(t).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })
              }
              stroke={AXIS}
              fontSize={12}
              tickLine={false}
            />
            <YAxis
              stroke={AXIS}
              fontSize={12}
              tickLine={false}
              width={70}
              domain={yAxis?.domain}
              ticks={yAxis?.ticks}
              tickFormatter={(v: number) => fmt(v).replace(/\.00$/, "")}
            />
            <Tooltip content={<ChartTooltip fmt={fmt} />} />
            <Area
              dataKey="range"
              stroke="none"
              fill={`url(#band-${a.id})`}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="p50"
              stroke={MEDIAN}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="contributed"
              stroke={PUT_IN}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="linear"
              dataKey="actual"
              stroke={actualColor}
              strokeWidth={2.5}
              dot={{ r: 3.5, fill: actualColor, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="text-glass-3 mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
        <LegendKey swatch={<span className="h-0.5 w-4 rounded" style={{ background: actualColor }} />}>
          Actual (recorded values)
        </LegendKey>
        <LegendKey swatch={<span className="w-4 border-t border-dashed" style={{ borderColor: MEDIAN }} />}>
          Forecast median
        </LegendKey>
        <LegendKey swatch={<span className="h-2.5 w-4 rounded-sm" style={{ background: "rgba(10,132,255,0.3)" }} />}>
          Forecast range (p10–p90)
        </LegendKey>
        <LegendKey swatch={<span className="h-0.5 w-4 rounded" style={{ background: PUT_IN }} />}>
          Put in
        </LegendKey>
      </div>
    </div>
  );
}

function LegendKey({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {children}
    </span>
  );
}

function ChartTooltip({
  active,
  payload,
  fmt,
}: {
  active?: boolean;
  payload?: { payload: PerformancePoint }[];
  fmt: (n: number) => string;
}) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div style={tooltipStyle} className="px-3 py-2">
      <div className="text-glass-2 mb-1">{formatDate(new Date(p.t).toISOString())}</div>
      {p.actual !== undefined && (
        <div className="num" style={{ color: ACTUAL }}>
          Actual {fmt(p.actual)}
        </div>
      )}
      <div className="num" style={{ color: MEDIAN }}>
        Forecast {fmt(p.p50)}
      </div>
      <div className="num text-glass-3">
        Range {fmt(p.p10)} – {fmt(p.p90)}
      </div>
      <div className="num text-glass-2">Put in {fmt(p.contributed)}</div>
    </div>
  );
}

/** Record (or correct) what an investment account was worth on a day. */
function RecordValueModal({
  accounts,
  accountId: initialAccountId,
  valuation,
  onClose,
  onSaved,
}: {
  accounts: InvestmentAccountPerformance[];
  accountId?: string;
  valuation?: Valuation;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [accountId, setAccountId] = useState(initialAccountId ?? accounts[0]?.id ?? "");
  const [date, setDate] = useState(valuation ? valuation.date.slice(0, 10) : today);
  const [value, setValue] = useState(valuation ? String(valuation.value) : "");
  const [note, setNote] = useState(valuation?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const account = accounts.find((a) => a.id === accountId);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const amount = Number(value);
    if (value.trim() === "" || !Number.isFinite(amount) || amount < 0)
      return setError("Enter what the account was worth.");
    if (!date) return setError("Pick a date.");
    if (date > today) return setError("A value can't be dated in the future.");
    const payload = {
      accountId,
      date: new Date(date).toISOString(),
      value: amount,
      note: note.trim() || null,
    };
    setSaving(true);
    try {
      if (valuation) await api.updateValuation(valuation.id, payload);
      else await api.createValuation(payload);
      toast.success(valuation ? "Value updated." : `Value recorded for “${account?.name}”.`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal title={valuation ? "Edit Value" : "Record Value"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Account">
          <select
            className="w-full"
            value={accountId}
            disabled={!!valuation}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              className="w-full"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Worth">
            <input
              type="number"
              step="0.01"
              min="0"
              className="num w-full"
              autoFocus
              placeholder={account ? String(account.value) : ""}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Note (optional)">
          <input
            className="w-full"
            placeholder="e.g. from the Vanguard app"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <p className="text-glass-3 text-xs">
          What the account was worth at the end of that day, including anything paid in that day. It
          becomes the account's balance from then on, so your net worth follows the market too.
        </p>
        {error && <div className="text-sm text-[#ff6b8a]">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
