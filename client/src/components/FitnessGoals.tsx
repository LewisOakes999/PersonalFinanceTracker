import { useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, Dumbbell, Flag, Plus, Scale, type LucideIcon } from "lucide-react";
import { api, type FitnessGoalInput } from "../api/client";
import type { BodyMeasure, BodyWeight, FitnessGoal, FitnessGoalType, Workout, WorkoutKind } from "../types";
import { Button, Field, Modal, SectionTitle, Tile } from "./ui";
import { DurationBox } from "./LogWorkoutModal";
import { KIND_ICONS } from "../lib/fitnessIcons";
import { formatPace, joinDuration, kindInfo, paceValue, splitDuration, type DurationParts } from "../lib/fitness";
import {
  formatGoalRate,
  formatGoalValue,
  goalStatus,
  goalTitle,
  measureLabel,
  type GoalStatus,
} from "../lib/goals";
import { clockAxis, fittedAxis } from "../lib/chart";
import { formatDate } from "../lib/format";
import { tooltipStyle } from "../pages/Dashboard";

const ACCENT = "var(--accent-soft)";
const MUTED = "rgba(245,245,247,0.55)";
const AXIS = "rgba(245,245,247,0.45)";
const CARDIO_KINDS: WorkoutKind[] = ["run", "cycle", "swim", "walk"];

const DAY_MS = 24 * 60 * 60 * 1000;
const dayOf = (iso: string | Date) => Math.floor(new Date(iso).getTime() / DAY_MS);
const isoOf = (day: number) => new Date(day * DAY_MS).toISOString();
const shortDate = (day: number) =>
  new Date(day * DAY_MS).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const todayIso = () => new Date().toISOString().slice(0, 10);

const TYPES: { id: FitnessGoalType; label: string; icon: LucideIcon }[] = [
  { id: "strength", label: "Lift", icon: Dumbbell },
  { id: "cardio", label: "Cardio time", icon: KIND_ICONS.run },
  { id: "body", label: "Body", icon: Scale },
];

const goalIcon = (g: FitnessGoal): LucideIcon =>
  g.type === "strength" ? Dumbbell : g.type === "cardio" ? KIND_ICONS[g.kind ?? "run"] : Scale;

/** "in 5 days", "in 9 weeks", "in 7 months". */
function fromNow(days: number): string {
  if (days < 14) return `in ${days} day${days === 1 ? "" : "s"}`;
  if (days <= 26 * 7) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30.44)} months`;
}

/** What the sessions behind a goal are, in words, for prompts. */
function sessionsNoun(g: FitnessGoal): string {
  if (g.type === "strength") return g.exercise ?? "the lift";
  if (g.type === "cardio") return `${parseFloat((g.distanceKm ?? 0).toFixed(2))} km+ ${kindInfo(g.kind ?? "run").label.toLowerCase()}s`;
  return "weigh-ins";
}

/** A headline and a line of detail on when you'll get there. */
function outlookWords(s: GoalStatus): { headline: string; detail: string } {
  const g = s.goal;
  const rate = s.ratePerDay !== null ? formatGoalRate(g, s.ratePerDay, s.better) : "";
  switch (s.outlook.state) {
    case "reached":
      return { headline: `Reached ${formatDate(s.outlook.date)}`, detail: "" };
    case "due":
      return {
        headline: "Ready now",
        detail:
          g.type === "strength"
            ? "Your recent lifts say you've got it in you. Time to go for it."
            : g.type === "cardio"
              ? "Your recent form says you're there. The next good effort should do it."
              : "Your trend is right on it. Any day now.",
      };
    case "projected":
      return { headline: `Projected ${formatDate(s.outlook.date)}`, detail: `${fromNow(s.outlook.days)}, at ${rate}` };
    case "far":
      return { headline: "Over three years away", detail: `At ${rate}. A nearer target might keep it moving.` };
    case "stalled":
      return {
        headline: "No date yet",
        detail:
          g.type === "body"
            ? `Your trend has been heading the other way (${rate}).`
            : `No improvement over the last 12 weeks (${rate}).`,
      };
    case "needData":
      return {
        headline: "No date yet",
        detail:
          g.type === "body"
            ? "Weigh in at least three times over two weeks to see a projected date."
            : `Log ${sessionsNoun(g)} in at least three different weeks to see a projected date.`,
      };
  }
}

// ── The Goals page ─────────────────────────────────────────────────────────

export function GoalsView({
  statuses,
  onNew,
  onEdit,
  onDelete,
}: {
  statuses: GoalStatus[];
  onNew: () => void;
  onEdit: (g: FitnessGoal) => void;
  onDelete: (g: FitnessGoal) => void;
}) {
  const active = statuses.filter((s) => s.outlook.state !== "reached");
  const reached = statuses.filter((s) => s.outlook.state === "reached");

  if (statuses.length === 0) {
    return (
      <Tile className="flex flex-col items-center gap-4 p-10 text-center">
        <Flag size={22} strokeWidth={1.75} className="text-[color:var(--accent-soft)]" />
        <div>
          <div className="text-glass text-[15px] font-semibold">No goals yet</div>
          <p className="text-glass-3 mx-auto mt-1 max-w-md text-sm">
            Set a target, like a 100 kg bench, a sub-20 parkrun or a goal weight. You'll see how close you are and,
            from your recent progress, when you're likely to get there.
          </p>
        </div>
        <Button variant="primary" className="inline-flex items-center gap-1.5" onClick={onNew}>
          <Plus size={14} strokeWidth={2} /> Set your first goal
        </Button>
      </Tile>
    );
  }

  return (
    <>
      {active.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {active.map((s) => (
            <GoalCard key={s.goal.id} s={s} onEdit={() => onEdit(s.goal)} onDelete={() => onDelete(s.goal)} />
          ))}
        </div>
      ) : (
        <Tile className="flex flex-wrap items-center justify-between gap-3 p-[22px]">
          <p className="text-glass-3 text-sm">Every goal reached. Time to set the next one?</p>
          <Button variant="primary" className="inline-flex items-center gap-1.5" onClick={onNew}>
            <Plus size={14} strokeWidth={2} /> New Goal
          </Button>
        </Tile>
      )}

      {reached.length > 0 && (
        <Tile className="p-[22px]">
          <SectionTitle>Reached</SectionTitle>
          <ul className="divide-y divide-white/10">
            {reached.map((s) => {
              const Icon = goalIcon(s.goal);
              return (
                <li key={s.goal.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--accent-rgb)/0.15)] text-[color:var(--accent-soft)]">
                      <Icon size={15} strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="text-glass block truncate">{goalTitle(s.goal)}</span>
                      <span className="text-glass-3 block text-xs">
                        <Check size={11} strokeWidth={2.5} className="mr-1 inline text-[color:var(--accent-soft)]" />
                        {outlookWords(s).headline} · set {formatDate(s.goal.startDate)}
                      </span>
                    </span>
                  </span>
                  <button className="shrink-0 text-xs text-[#ff6b8a] hover:underline" onClick={() => onDelete(s.goal)}>
                    delete
                  </button>
                </li>
              );
            })}
          </ul>
        </Tile>
      )}
    </>
  );
}

function GoalCard({ s, onEdit, onDelete }: { s: GoalStatus; onEdit: () => void; onDelete: () => void }) {
  const g = s.goal;
  const Icon = goalIcon(g);
  const words = outlookWords(s);
  const pct = Math.round(s.progress * 100);

  // The small print under each figure.
  let currentSub = g.type === "body" ? "7-reading average" : "best in the last 12 weeks";
  if (g.type === "cardio" && s.current !== null && g.kind && g.distanceKm) {
    currentSub = formatPace(g.kind, paceValue(g.kind, g.distanceKm, s.current)!);
  }
  let targetSub = "";
  if (g.type === "strength" && g.weightKg !== null && (g.reps ?? 1) > 1) targetSub = `${g.weightKg} kg × ${g.reps}`;
  if (g.type === "cardio" && g.kind && g.distanceKm && g.timeSec)
    targetSub = formatPace(g.kind, paceValue(g.kind, g.distanceKm, g.timeSec)!);
  if (g.type === "body" && s.start !== null) {
    const diff = Math.abs(s.target - s.start);
    targetSub = `${s.better === "down" ? "losing" : "gaining"} ${parseFloat(diff.toFixed(1))}${g.measure === "bodyFat" ? "%" : " kg"}`;
  }

  return (
    <Tile className="p-[22px]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent-rgb)/0.15)] text-[color:var(--accent-soft)]">
            <Icon size={17} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="text-glass truncate text-[15px] font-semibold">{goalTitle(g)}</div>
            <div className="text-glass-3 text-xs">
              Set {formatDate(g.startDate)}
              {g.deadline && ` · aiming for ${formatDate(g.deadline)}`}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-3 text-xs">
          <button className="text-[color:var(--accent-soft)] hover:underline" onClick={onEdit}>
            edit
          </button>
          <button className="text-[#ff6b8a] hover:underline" onClick={onDelete}>
            delete
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Figure
          label={measureLabel(g)}
          value={s.current !== null ? formatGoalValue(g, s.current) : "—"}
          sub={s.current !== null ? currentSub : `no ${sessionsNoun(g)} lately`}
        />
        <Figure label="Target" value={formatGoalValue(g, s.target)} sub={targetSub} />
      </div>

      <div
        className="glass-nested mt-3 h-2.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-label={`${goalTitle(g)} progress`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-[rgb(var(--accent-rgb))]" style={{ width: `${pct}%` }} />
      </div>
      <div className="num text-glass-3 mt-1 flex justify-between text-xs">
        <span>{pct}%</span>
        {s.start !== null && <span>from {formatGoalValue(g, s.start)}</span>}
      </div>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-glass text-sm font-medium">{words.headline}</div>
          {words.detail && <div className="text-glass-3 mt-0.5 text-xs">{words.detail}</div>}
        </div>
        {s.deadline && <DeadlineChip d={s.deadline} />}
      </div>
      {s.deadline && !s.deadline.onTrack && s.deadline.neededPerDay !== null && (
        <p className="text-glass-3 mt-1 text-xs">
          To make {formatDate(s.deadline.date)} you'd need {formatGoalRate(g, s.deadline.neededPerDay, s.better)}.
        </p>
      )}

      {s.points.length > 0 && <GoalChart s={s} />}
    </Tile>
  );
}

function DeadlineChip({ d }: { d: NonNullable<GoalStatus["deadline"]> }) {
  const [text, cls] =
    d.daysLeft < 0
      ? ["Deadline passed", "text-glass-3 bg-white/[0.06]"]
      : d.onTrack
        ? ["On track", "text-[color:var(--accent-soft)] bg-[rgb(var(--accent-rgb)/0.15)]"]
        : ["Behind", "text-warn bg-[rgba(255,214,10,0.12)]"];
  return <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{text}</span>;
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-glass-3 text-[11px] font-medium uppercase tracking-[0.08em]">{label}</div>
      <div className="num text-glass mt-1 text-[20px] font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-glass-3 mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}

/** Recent points, the trend through them, and that trend carried on to the target. */
function GoalChart({ s }: { s: GoalStatus }) {
  const g = s.goal;
  const today = dayOf(new Date());
  const first = s.points[0].day;
  // Carry the line to the projected date, but not more than a year out, or the
  // real data gets squashed into a sliver at the left.
  const end = s.outlook.state === "projected" ? Math.min(dayOf(s.outlook.date), today + 365) : today;
  const deadlineDay = g.deadline ? dayOf(g.deadline) : null;
  const showDeadline = deadlineDay !== null && deadlineDay >= first && deadlineDay <= today + 365;
  const last = Math.max(end, today, showDeadline ? deadlineDay! : today);

  const rows = new Map<number, { day: number; value?: number; trend?: number }>();
  for (const p of s.points) rows.set(p.day, { day: p.day, value: p.value });
  if (s.trend) {
    for (const d of [first, end]) rows.set(d, { ...rows.get(d), day: d, trend: s.trend.at(d) });
  }
  const data = [...rows.values()].sort((a, b) => a.day - b.day);
  const values = [...s.points.map((p) => p.value), ...data.flatMap((d) => (d.trend === undefined ? [] : [d.trend])), s.target];
  const axis = g.type === "cardio" ? clockAxis(values) : fittedAxis(values);
  // Axis labels without the trailing ".0", so they fit beside the chart.
  const tick = (v: number) =>
    g.type === "body" ? `${parseFloat(v.toFixed(1))}${g.measure === "bodyFat" ? "%" : " kg"}` : formatGoalValue(g, v);
  const noun =
    g.type === "body" ? `your weigh-ins over the last ${s.windowDays / 7} weeks` : `your best each week over the last 12 weeks`;

  return (
    <>
      <div className="mt-4 h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis
              type="number"
              dataKey="day"
              domain={[first, last]}
              stroke={AXIS}
              fontSize={11}
              tickLine={false}
              tickCount={4}
              tickFormatter={(d: number) => shortDate(Math.round(d))}
            />
            <YAxis
              stroke={AXIS}
              fontSize={11}
              tickLine={false}
              width={56}
              // Quicker is up for times, as on the other cardio charts.
              reversed={g.type === "cardio"}
              domain={axis?.domain}
              ticks={axis?.ticks}
              tickFormatter={tick}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(d) => formatDate(isoOf(Number(d)))}
              formatter={(v: number, name) => [formatGoalValue(g, v), name]}
            />
            <ReferenceLine
              y={s.target}
              stroke={ACCENT}
              strokeDasharray="2 4"
              label={{ value: "target", position: "insideTopLeft", fill: ACCENT, fontSize: 11 }}
            />
            {showDeadline && (
              <ReferenceLine
                x={deadlineDay!}
                stroke={MUTED}
                strokeDasharray="4 4"
                label={{ value: "deadline", position: "insideTopRight", fill: MUTED, fontSize: 11 }}
              />
            )}
            <Line
              dataKey="trend"
              name="Trend"
              stroke={MUTED}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              dataKey="value"
              name={measureLabel(g)}
              stroke={ACCENT}
              strokeWidth={2}
              dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-glass-3 mt-2 text-[11px]">
        Dots are {noun}
        {s.trend && `; the dashed line is the trend${s.outlook.state === "projected" ? ", carried on to your target" : ""}`}.
      </p>
    </>
  );
}

// ── On the Overview ────────────────────────────────────────────────────────

/** A short "when": "≈ 14 Mar 2027", "Ready now", "No date yet". */
function shortOutlook(s: GoalStatus): string {
  switch (s.outlook.state) {
    case "projected":
      return `≈ ${formatDate(s.outlook.date)}`;
    case "due":
      return "Ready now";
    case "far":
      return "3+ years away";
    default:
      return "No date yet";
  }
}

export function GoalsTile({ statuses, onOpen }: { statuses: GoalStatus[]; onOpen: () => void }) {
  const active = statuses.filter((s) => s.outlook.state !== "reached");
  if (active.length === 0) return null;
  return (
    <Tile className="p-[22px]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">Goals</h2>
        <button className="text-[color:var(--accent-soft)] text-xs hover:underline" onClick={onOpen}>
          {active.length > 3 ? `See all ${active.length}` : "See details"}
        </button>
      </div>
      <ul className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-3">
        {active.slice(0, 3).map((s) => (
          <li key={s.goal.id} className="min-w-0">
            <div className="text-glass truncate text-sm">{goalTitle(s.goal)}</div>
            <div className="glass-nested mt-1.5 h-1.5 w-full overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-[rgb(var(--accent-rgb))]"
                style={{ width: `${Math.round(s.progress * 100)}%` }}
              />
            </div>
            <div className="text-glass-3 num mt-1 flex justify-between text-xs">
              <span>{Math.round(s.progress * 100)}%</span>
              <span>{shortOutlook(s)}</span>
            </div>
          </li>
        ))}
      </ul>
    </Tile>
  );
}

// ── Setting a goal ─────────────────────────────────────────────────────────

export function GoalModal({
  goal,
  exerciseNames,
  workouts,
  weights,
  onClose,
  onSaved,
}: {
  goal: FitnessGoal | null;
  exerciseNames: string[];
  workouts: Workout[];
  weights: BodyWeight[];
  onClose: () => void;
  onSaved: (g: FitnessGoal) => void;
}) {
  const [type, setType] = useState<FitnessGoalType>(goal?.type ?? "strength");
  const [exercise, setExercise] = useState(goal?.exercise ?? "");
  const [weight, setWeight] = useState(goal?.weightKg != null ? String(goal.weightKg) : "");
  const [reps, setReps] = useState(goal?.reps ? String(goal.reps) : "1");
  const [kind, setKind] = useState<WorkoutKind>(goal?.kind ?? "run");
  const [distance, setDistance] = useState(goal?.distanceKm ? String(goal.distanceKm) : "5");
  const [time, setTime] = useState<DurationParts>(() => splitDuration(goal?.timeSec ?? null, true));
  const [measure, setMeasure] = useState<BodyMeasure>(goal?.measure ?? "weight");
  const [target, setTarget] = useState(goal?.target != null ? String(goal.target) : "");
  const [deadline, setDeadline] = useState(goal?.deadline?.slice(0, 10) ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const listId = useId();
  const timeLabelId = useId();
  const startDate = goal?.startDate.slice(0, 10) ?? todayIso();

  /** The goal as typed, or what's wrong with it. */
  const built = useMemo((): FitnessGoalInput | string => {
    const blank = {
      exercise: null,
      weightKg: null,
      reps: null,
      kind: null,
      distanceKm: null,
      timeSec: null,
      measure: null,
      target: null,
    };
    if (deadline && deadline < startDate) return "The deadline can't be before the day you set the goal.";
    const common = { deadline: deadline ? new Date(deadline).toISOString() : null };
    if (type === "strength") {
      const name = exercise.trim();
      if (!name) return "Enter the exercise.";
      const w = weight.trim() === "" ? null : Number(weight);
      if (w !== null && (!Number.isFinite(w) || w <= 0 || w > 1000))
        return "Enter the weight in kg, or leave it blank for a bodyweight move.";
      const r = Number(reps);
      if (!Number.isInteger(r) || r < 1 || r > 1000) return "Enter the reps as a whole number.";
      return { ...blank, ...common, type, exercise: name, weightKg: w, reps: r };
    }
    if (type === "cardio") {
      const km = Number(distance);
      if (!distance.trim() || !Number.isFinite(km) || km <= 0 || km > 1000) return "Enter the distance in km.";
      const sec = joinDuration(time);
      if (sec === null) return "Enter the time to beat.";
      if (Number.isNaN(sec)) return "Enter the time as hours, minutes and seconds.";
      return { ...blank, ...common, type, kind, distanceKm: km, timeSec: sec };
    }
    const t = Number(target);
    const [lo, hi] = measure === "weight" ? [20, 400] : [2, 75];
    if (!target.trim() || !Number.isFinite(t) || t < lo || t > hi)
      return measure === "weight" ? "Enter a target weight in kg." : "Enter a target body fat between 2 and 75%.";
    return { ...blank, ...common, type, measure, target: t };
  }, [type, exercise, weight, reps, kind, distance, time, measure, target, deadline, startDate]);

  // How it looks against what's logged, before saving.
  const preview = useMemo(() => {
    if (typeof built === "string") return null;
    const draft: FitnessGoal = {
      ...built,
      id: goal?.id ?? "draft",
      startDate: `${startDate}T00:00:00.000Z`,
      createdAt: goal?.createdAt ?? new Date().toISOString(),
    };
    return goalStatus(draft, workouts, weights);
  }, [built, goal, startDate, workouts, weights]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (typeof built === "string") return setError(built);
    setError("");
    setSaving(true);
    try {
      const saved = goal
        ? await api.updateFitnessGoal(goal.id, built)
        : await api.createFitnessGoal({ ...built, startDate: `${startDate}T00:00:00.000Z` });
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  const pace =
    type === "cardio" && typeof built !== "string" && built.distanceKm && built.timeSec
      ? formatPace(kind, paceValue(kind, built.distanceKm, built.timeSec)!)
      : null;

  return (
    <Modal title={goal ? "Edit Goal" : "New Goal"} onClose={onClose} opaque>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kind of goal">
          {TYPES.map((t) => {
            const on = type === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setType(t.id)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs transition-colors ${
                  on
                    ? "border-[rgb(var(--accent-rgb)/0.6)] bg-[rgb(var(--accent-rgb)/0.18)] text-white"
                    : "border-white/10 bg-white/5 text-glass-3 hover:text-glass"
                }`}
              >
                <t.icon size={16} strokeWidth={1.75} />
                {t.label}
              </button>
            );
          })}
        </div>

        {type === "strength" && (
          <>
            <Field label="Exercise">
              <input
                className="w-full"
                list={listId}
                placeholder="e.g. Bench press"
                value={exercise}
                onChange={(e) => setExercise(e.target.value)}
              />
              <datalist id={listId}>
                {exerciseNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Weight (kg)">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  className="num w-full"
                  placeholder="e.g. 100"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </Field>
              <Field label="Reps">
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className="num w-full"
                  value={reps}
                  onChange={(e) => setReps(e.target.value)}
                />
              </Field>
            </div>
            <p className="text-glass-3 -mt-2 text-xs">
              Leave the weight blank for a bodyweight move like pull-ups, and the goal is the reps.
            </p>
          </>
        )}

        {type === "cardio" && (
          <>
            <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Kind of cardio">
              {CARDIO_KINDS.map((k) => {
                const Icon = KIND_ICONS[k];
                const on = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setKind(k)}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                      on
                        ? "border-[rgb(var(--accent-rgb)/0.6)] bg-[rgb(var(--accent-rgb)/0.18)] text-white"
                        : "border-white/10 bg-white/5 text-glass-3 hover:text-glass"
                    }`}
                  >
                    <Icon size={13} strokeWidth={1.75} /> {kindInfo(k).label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr]">
              <Field label="Distance (km)">
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  className="num w-full"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                />
              </Field>
              <div role="group" aria-labelledby={timeLabelId}>
                <span id={timeLabelId} className="text-glass-3 mb-1 block text-xs uppercase tracking-wider">
                  Time to beat
                </span>
                <div className="flex items-center gap-2">
                  <DurationBox label="Hours" unit="h" placeholder="0" value={time.h} onChange={(h) => setTime((t) => ({ ...t, h }))} />
                  <DurationBox label="Minutes" unit="m" placeholder="20" value={time.m} onChange={(m) => setTime((t) => ({ ...t, m }))} />
                  <DurationBox label="Seconds" unit="s" placeholder="00" value={time.s} onChange={(v) => setTime((t) => ({ ...t, s: v }))} />
                </div>
              </div>
            </div>
            <p className="text-glass-3 -mt-2 text-xs">
              {pace ? `That's ${pace}. ` : ""}Any steady {kindInfo(kind).label.toLowerCase()} at least this far counts, at
              its average pace.
            </p>
          </>
        )}

        {type === "body" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Measure">
              <select className="w-full" value={measure} onChange={(e) => setMeasure(e.target.value as BodyMeasure)}>
                <option value="weight">Body weight</option>
                <option value="bodyFat">Body fat %</option>
              </select>
            </Field>
            <Field label={measure === "weight" ? "Target (kg)" : "Target (%)"}>
              <input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                className="num w-full"
                placeholder={measure === "weight" ? "e.g. 80" : "e.g. 15"}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Field>
          </div>
        )}

        <Field label="Aim to reach it by (optional)">
          <input type="date" className="w-full" min={startDate} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </Field>

        {preview && <Preview s={preview} />}

        {error && <div className="text-sm text-[#ff6b8a]">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : goal ? "Save" : "Set Goal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Where the goal as typed stands today, so you can pitch the target right. */
function Preview({ s }: { s: GoalStatus }) {
  const g = s.goal;
  let lead: string;
  if (s.current === null) {
    lead =
      g.type === "body"
        ? `No ${g.measure === "bodyFat" ? "body fat readings" : "weigh-ins"} yet. Log one to start tracking.`
        : `No ${sessionsNoun(g)} logged in the last 12 weeks yet.`;
  } else {
    lead = `${measureLabel(g)} now: ${formatGoalValue(g, s.current)}.`;
    if (g.type === "body" && s.start !== null) {
      const diff = parseFloat(Math.abs(s.target - s.start).toFixed(1));
      lead += ` That's ${s.better === "down" ? "losing" : "gaining"} ${diff}${g.measure === "bodyFat" ? "%" : " kg"}.`;
    }
  }
  let then = "";
  if (s.current !== null) {
    switch (s.outlook.state) {
      case "reached":
        then = `Already reached on ${formatDate(s.outlook.date)}.`;
        break;
      case "due":
        then = "Your recent form says you're already there. It counts the next time you do it.";
        break;
      case "projected":
        then = `At your current rate you'd get there around ${formatDate(s.outlook.date)} (${fromNow(s.outlook.days)}).`;
        break;
      case "far":
        then = "At your current rate it's more than three years away.";
        break;
      case "stalled":
        then = "You haven't been improving lately, so there's no projected date yet.";
        break;
      case "needData":
        then = "A few more weeks of data and you'll see a projected date.";
        break;
    }
  }
  return (
    <div className="glass-nested rounded-xl px-3 py-2.5 text-xs">
      <span className="text-glass">{lead}</span> <span className="text-glass-3">{then}</span>
    </div>
  );
}
