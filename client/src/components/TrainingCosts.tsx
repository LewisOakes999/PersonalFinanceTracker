import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import type { Category, FitnessSpending, Gear, Workout, WorkoutKind } from "../types";
import { Button, Modal, Tile } from "./ui";
import { KIND_ICONS } from "../lib/fitnessIcons";
import { KINDS } from "../lib/fitness";
import { trainingCosts } from "../lib/costs";
import { useCurrency } from "../lib/CurrencyContext";
import { toast } from "../lib/toast";
import { tooltipStyle } from "../pages/Dashboard";

const ACCENT = "var(--accent-soft)";
const KIT = "rgb(var(--accent-rgb))";
const AXIS = "rgba(245,245,247,0.45)";

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

/** "3 workouts", or "1 strength & class workout". */
const workoutsNoun = (n: number, kinds: WorkoutKind[]) =>
  `${n} ${kinds.map((k) => `${KINDS.find((x) => x.id === k)?.label.toLowerCase() ?? k} `).join("& ")}workout${n === 1 ? "" : "s"}`;

/** Spending chosen as fitness against the workouts it paid for: cost per visit and per workout. */
export function CostsSection({
  data,
  workouts,
  gear,
  onChoose,
}: {
  data: FitnessSpending;
  workouts: Workout[];
  gear: Gear[];
  onChoose: () => void;
}) {
  const { format } = useCurrency();
  const costs = useMemo(() => trainingCosts(data, workouts, gear), [data, workouts, gear]);
  const now = costs.months[costs.months.length - 1];
  // Costs count from when you started logging, so the period can be shorter.
  const trimmed = costs.months.length < data.months.length;
  const span =
    trimmed && costs.months.length > 0
      ? `Since ${new Date(`${costs.months[0].month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" })}`
      : `Last ${data.months.length} months`;

  if (!now || (data.categories.length === 0 && costs.total.kit === 0)) {
    return (
      <Tile className="p-[22px]">
        <h2 className="text-glass-2 mb-2 text-[13px] font-semibold uppercase tracking-[0.06em]">What training costs</h2>
        <p className="text-glass-3 max-w-xl text-sm">
          Pick the spending that's for fitness, like your gym membership or race entries, and which workouts each one
          pays for. You'll see what each visit and each workout really costs, month by month.
        </p>
        <Button variant="primary" className="mt-4" onClick={onChoose}>
          Choose spending
        </Button>
      </Tile>
    );
  }

  const chart = costs.months.map((m) => ({
    label: monthLabel(m.month),
    ...Object.fromEntries(data.categories.map((c, i) => [c.id, Math.round(m.byCategory[i] * 100) / 100])),
    kit: Math.round(m.kit * 100) / 100,
    perWorkout: m.perWorkout === null ? null : Math.round(m.perWorkout * 100) / 100,
  }));
  const names = new Map<string, string>([...data.categories.map((c) => [c.id, c.name] as [string, string]), ["kit", "Kit"]]);

  return (
    <Tile className="p-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">What training costs</h2>
        <button className="text-[color:var(--accent-soft)] text-xs hover:underline" onClick={onChoose}>
          Choose spending
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-4">
        <Figure
          label="This month"
          value={format(now.total)}
          sub={`${workoutsNoun(now.workouts, [])}${now.perWorkout !== null ? ` · ${format(now.perWorkout)} each` : ""}`}
        />
        <Figure
          label={span}
          value={format(costs.total.spend)}
          sub={`${workoutsNoun(costs.total.workouts, [])}${costs.total.perWorkout !== null ? ` · ${format(costs.total.perWorkout)} each` : ""}`}
        />
        {costs.categories.map((c) => (
          <Figure
            key={c.id}
            label={`${c.name} per visit`}
            value={c.overall.perVisit !== null ? format(c.overall.perVisit) : "—"}
            accent={c.overall.perVisit !== null}
            sub={
              c.thisMonth.perVisit !== null
                ? `this month ${format(c.thisMonth.spend)} ÷ ${c.thisMonth.visits} = ${format(c.thisMonth.perVisit)}`
                : c.overall.months > 0
                  ? `over ${workoutsNoun(c.overall.visits, c.kinds)}`
                  : `no ${c.name} spending yet`
            }
          />
        ))}
      </div>

      <div className="mt-5 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} />
            <YAxis yAxisId="spend" stroke={AXIS} fontSize={12} tickLine={false} width={56} tickFormatter={(v: number) => format(v).replace(/\.00$/, "")} />
            <YAxis
              yAxisId="per"
              orientation="right"
              stroke={AXIS}
              fontSize={12}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) => format(v).replace(/\.00$/, "")}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "rgba(255,255,255,0.05)" }}
              formatter={(v: number, key) => [format(v), key === "perWorkout" ? "Per workout" : (names.get(String(key)) ?? key)]}
            />
            {data.categories.map((c) => (
              <Bar key={c.id} yAxisId="spend" dataKey={c.id} stackId="spend" fill={c.color} isAnimationActive={false} />
            ))}
            <Bar yAxisId="spend" dataKey="kit" stackId="spend" fill={KIT} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line
              yAxisId="per"
              type="monotone"
              dataKey="perWorkout"
              stroke={ACCENT}
              strokeWidth={2.5}
              dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="text-glass-3 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {data.categories.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: c.color }} /> {c.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: KIT }} /> Kit, when bought
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded" style={{ background: ACCENT }} /> Cost per workout (right axis)
        </span>
        {trimmed && <span>Counted from the month you started logging workouts.</span>}
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

/** Pick the spending categories that are for fitness, and the workouts each pays for. */
export function SpendingModal({
  current,
  onClose,
  onSaved,
}: {
  current: FitnessSpending["categories"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [chosen, setChosen] = useState(() => new Map<string, WorkoutKind[]>(current.map((c) => [c.id, c.kinds])));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .listCategories()
      .then((cs) => setCategories(cs.filter((c) => c.type === "expense").sort((a, b) => a.name.localeCompare(b.name))))
      .catch((e) => toast.error((e as Error).message));
  }, []);

  const toggle = (id: string) =>
    setChosen((m) => {
      const next = new Map(m);
      if (next.has(id)) next.delete(id);
      else next.set(id, []);
      return next;
    });
  const toggleKind = (id: string, k: WorkoutKind) =>
    setChosen((m) => {
      const kinds = m.get(id) ?? [];
      return new Map(m).set(id, kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]);
    });

  const save = async () => {
    setSaving(true);
    try {
      await api.setFitnessSpending([...chosen].map(([categoryId, kinds]) => ({ categoryId, kinds })));
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal title="Fitness spending" onClose={onClose} opaque>
      <p className="text-glass-3 mb-4 text-sm">
        Which of your spending categories are for fitness? For each, pick the workouts it pays for, like strength and
        classes for a gym membership. Leave them all off and it counts every workout.
      </p>
      {!categories ? (
        <p className="text-glass-3 text-sm">Loading…</p>
      ) : (
        <ul className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {categories.map((c) => {
            const on = chosen.has(c.id);
            const kinds = chosen.get(c.id) ?? [];
            return (
              <li key={c.id} className={`rounded-xl px-3 py-2 ${on ? "glass-nested" : ""}`}>
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input type="checkbox" checked={on} onChange={() => toggle(c.id)} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                  <span className="text-glass">{c.name}</span>
                </label>
                {on && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {KINDS.map((k) => {
                      const Icon = KIND_ICONS[k.id];
                      const picked = kinds.includes(k.id);
                      return (
                        <button
                          key={k.id}
                          type="button"
                          aria-pressed={picked}
                          onClick={() => toggleKind(c.id, k.id)}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                            picked
                              ? "border-[rgb(var(--accent-rgb)/0.6)] bg-[rgb(var(--accent-rgb)/0.18)] text-white"
                              : "border-white/10 bg-white/5 text-glass-3 hover:text-glass"
                          }`}
                        >
                          <Icon size={11} strokeWidth={1.75} /> {k.label}
                        </button>
                      );
                    })}
                    <span className="text-glass-3 self-center text-[11px]">
                      {kinds.length === 0 ? "· counts every workout" : ""}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={saving || !categories}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}
