import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus } from "lucide-react";
import { api } from "../api/client";
import type { BodyWeight, FitnessGoal, Gear, Workout, WorkoutKind, WorkoutPreset } from "../types";
import { Button, Field, SectionTitle, StatTile, Tile } from "../components/ui";
import { LogWorkoutModal } from "../components/LogWorkoutModal";
import { GoalModal, GoalsTile, GoalsView } from "../components/FitnessGoals";
import { KitModal, KitView } from "../components/Kit";
import { defaultKit } from "../lib/kit";
import { goalStatus, goalTitle, newlyReached, type GoalStatus } from "../lib/goals";
import {
  byBodyFat,
  cardioBests,
  cardioSessions,
  exerciseProgress,
  formatClock,
  formatMetres,
  formatMinutes,
  formatPace,
  intervalSessions,
  isIntervalRun,
  kindInfo,
  leanMassKg,
  movingAverage,
  paceHigherIsBetter,
  repBests,
  streak,
  weeklySummary,
  weightChange,
  workoutSummary,
  type ExerciseProgress,
  type IntervalSession,
} from "../lib/fitness";
import { KIND_ICONS } from "../lib/fitnessIcons";
import { fittedAxis } from "../lib/chart";
import { formatDate, formatSigned } from "../lib/format";
import { toast } from "../lib/toast";
import { tooltipStyle } from "./Dashboard";

// Health takes its colour from the area accent (pale green — see index.css),
// so charts follow light and dark themes too. Gold marks personal bests.
const ACCENT = "var(--accent-soft)"; // lines and highlighted figures
const BAR = "rgb(var(--accent-rgb))"; // bars
const PB = "#ffd60a";
const MUTED = "rgba(245,245,247,0.55)";
const AXIS = "rgba(245,245,247,0.45)";
const CARDIO: WorkoutKind[] = ["run", "cycle", "swim", "walk"];

/** Which part of Fitness to show — each is its own page in the sidebar's Health section. */
export type FitnessView = "overview" | "strength" | "cardio" | "weight" | "goals" | "kit";

const HEADINGS: Record<FitnessView, { title: string; blurb: string }> = {
  overview: { title: "Fitness overview", blurb: "Your week, your streak and your recent workouts" },
  strength: { title: "Strength", blurb: "Each lift's progress and personal bests" },
  cardio: { title: "Cardio", blurb: "Distance and pace for your runs, rides, swims and walks" },
  weight: { title: "Body weight", blurb: "Your weight and body fat over time" },
  goals: { title: "Fitness goals", blurb: "Targets for your lifts, times and weight, and when you'll reach them" },
  kit: { title: "Kit & costs", blurb: "How far your kit has gone, and what it's cost per km" },
};

/** "14 Oct" — for chart axes, where the year is noise. */
const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// Up to two decimals, so 1.25 kg plate jumps (73.75 kg) show exactly.
const kg = (n: number) => `${parseFloat(n.toFixed(2))} kg`;

export default function Fitness({
  view = "overview",
  onView,
}: { view?: FitnessView; onView?: (v: FitnessView) => void } = {}) {
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [weights, setWeights] = useState<BodyWeight[]>([]);
  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [goal, setGoal] = useState(3);
  const [editing, setEditing] = useState<Workout | "new" | null>(null);
  const [goals, setGoals] = useState<FitnessGoal[]>([]);
  const [editingGoal, setEditingGoal] = useState<FitnessGoal | "new" | null>(null);
  const [gear, setGear] = useState<Gear[]>([]);
  const [editingKit, setEditingKit] = useState<Gear | "new" | null>(null);

  const loadWorkouts = () => api.listWorkouts().then((w) => (setWorkouts(w), w));
  const loadWeights = () => api.listBodyWeights().then((w) => (setWeights(w), w));
  const loadPresets = () => api.listPresets().then(setPresets).catch(() => setPresets([]));
  const loadGoals = () => api.listFitnessGoals().then(setGoals).catch(() => setGoals([]));
  const loadGear = () => api.listGear().then(setGear).catch(() => setGear([]));
  useEffect(() => {
    loadPresets();
    loadGoals();
    loadGear();
    loadWorkouts().catch((e) => toast.error((e as Error).message));
    loadWeights().catch(() => setWeights([]));
    api
      .getSettings()
      .then((s) => setGoal(s.weeklyWorkoutGoal ?? 3))
      .catch(() => {});
  }, []);

  const progress = useMemo(() => exerciseProgress(workouts ?? []), [workouts]);
  const statuses = useMemo(
    () => goals.map((g) => goalStatus(g, workouts ?? [], weights)),
    [goals, workouts, weights]
  );
  /** Cheer any goal the latest workout or weigh-in pushed over the line. */
  const celebrate = (after: GoalStatus[]) => {
    for (const s of newlyReached(statuses, after)) toast.success(`Goal reached: ${goalTitle(s.goal)}!`);
  };

  const saved = async (w: Workout) => {
    const wasEdit = editing !== "new";
    setEditing(null);
    const fresh = await loadWorkouts();
    // Celebrate any personal best this workout set: a lift, or a run/ride/swim/walk
    // that's the fastest or longest yet (a first-ever session doesn't count).
    const pbs = exerciseProgress(fresh).flatMap((p) =>
      p.sessions
        .filter((s) => s.workoutId === w.id && s.pb)
        .map((s) => (p.bodyweight ? `${p.name} (${s.bestReps} reps)` : `${p.name} (${kg(s.topWeight)} × ${s.topReps})`))
    );
    if (CARDIO.includes(w.kind)) {
      const sessions = cardioSessions(fresh, w.kind);
      const { fastest, longest } = cardioBests(sessions, w.kind);
      const label = kindInfo(w.kind).label.toLowerCase();
      if (sessions.length > 1 && fastest?.workoutId === w.id)
        pbs.push(`${paceHigherIsBetter(w.kind) ? "fastest" : "best-paced"} ${label} (${formatPace(w.kind, fastest.pace)})`);
      if (sessions.length > 1 && longest?.workoutId === w.id) pbs.push(`longest ${label} (${longest.km} km)`);
    }
    // Interval runs: a faster average than any earlier session of the same
    // shape, or the quickest rep yet at a distance run before.
    if (isIntervalRun(w)) {
      const session = intervalSessions(fresh).find((s) => s.workoutId === w.id);
      if (session?.pb) pbs.push(`${session.structure} (${sessionScore(session)})`);
      for (const b of repBests(fresh)) {
        const runBefore = fresh.some(
          (o) => o.id !== w.id && isIntervalRun(o) && o.intervals.some((r) => r.distanceM === b.distanceM && r.durationSec)
        );
        if (b.workoutId === w.id && runBefore) pbs.push(`fastest ${formatMetres(b.distanceM)} rep (${formatClock(b.sec)})`);
      }
    }
    if (pbs.length > 0) toast.success(`New PB: ${pbs.join(", ")}`);
    else toast.success(wasEdit ? "Workout updated." : "Workout logged.");
    celebrate(goals.map((g) => goalStatus(g, fresh, weights)));
  };

  const weightsChanged = async () => {
    const fresh = await loadWeights().catch(() => null);
    if (fresh) celebrate(goals.map((g) => goalStatus(g, workouts ?? [], fresh)));
  };

  const goalSaved = (g: FitnessGoal) => {
    toast.success(editingGoal === "new" ? `Goal set: ${goalTitle(g)}.` : "Goal updated.");
    setEditingGoal(null);
    loadGoals();
  };

  const kitSaved = (g: Gear) => {
    toast.success(editingKit === "new" ? `Added “${g.name}”.` : "Kit updated.");
    setEditingKit(null);
    loadGear();
  };

  const removeGoal = async (g: FitnessGoal) => {
    if (!confirm(`Delete the goal "${goalTitle(g)}"?`)) return;
    try {
      await api.deleteFitnessGoal(g.id);
      toast.success("Goal deleted.");
      loadGoals();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async (w: Workout) => {
    if (!confirm(`Delete this ${kindInfo(w.kind).label.toLowerCase()} workout from ${formatDate(w.date)}?`)) return;
    try {
      await api.deleteWorkout(w.id);
      toast.success("Workout deleted.");
      loadWorkouts();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const changeGoal = async (n: number) => {
    setGoal(n);
    try {
      await api.updateWeeklyGoal(n);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">{HEADINGS[view].title}</h1>
          <p className="text-glass-3 mt-1 text-[13px]">{HEADINGS[view].blurb}</p>
        </div>
        {view === "goals" ? (
          <Button variant="primary" className="inline-flex items-center gap-1.5" onClick={() => setEditingGoal("new")}>
            <Plus size={14} strokeWidth={2} /> New Goal
          </Button>
        ) : view === "kit" ? (
          <Button variant="primary" className="inline-flex items-center gap-1.5" onClick={() => setEditingKit("new")}>
            <Plus size={14} strokeWidth={2} /> Add Kit
          </Button>
        ) : (
          <Button variant="primary" className="inline-flex items-center gap-1.5" onClick={() => setEditing("new")}>
            <Plus size={14} strokeWidth={2} /> Log Workout
          </Button>
        )}
      </header>

      {workouts && view === "overview" && (
        <Overview
          workouts={workouts}
          goal={goal}
          onGoal={changeGoal}
          pbWorkouts={
            new Set([
              ...progress.flatMap((p) => p.sessions.filter((s) => s.pb).map((s) => s.workoutId)),
              ...intervalSessions(workouts).filter((s) => s.pb).map((s) => s.workoutId),
            ])
          }
          onLog={() => setEditing("new")}
          onEdit={setEditing}
          onDelete={remove}
          goalsTile={<GoalsTile statuses={statuses} onOpen={() => onView?.("goals")} />}
          kitNames={new Map(gear.map((g) => [g.id, g.name]))}
        />
      )}
      {workouts && view === "strength" && <StrengthView progress={progress} onLog={() => setEditing("new")} />}
      {workouts && view === "cardio" && <CardioView workouts={workouts} onLog={() => setEditing("new")} />}
      {view === "weight" && <WeightView weights={weights} onChanged={weightsChanged} />}
      {workouts && view === "goals" && (
        <GoalsView statuses={statuses} onNew={() => setEditingGoal("new")} onEdit={setEditingGoal} onDelete={removeGoal} />
      )}
      {workouts && view === "kit" && (
        <KitView
          gear={gear}
          workouts={workouts}
          onAdd={() => setEditingKit("new")}
          onEdit={setEditingKit}
          onChanged={loadGear}
        />
      )}

      {editing && (
        <LogWorkoutModal
          workout={editing === "new" ? null : editing}
          exerciseNames={progress.map((p) => p.name)}
          presets={presets}
          onPresetsChanged={loadPresets}
          onClose={() => setEditing(null)}
          onSaved={saved}
          gear={gear}
          defaultGear={(kind) => defaultKit(kind, gear, workouts ?? [])}
        />
      )}
      {editingKit && (
        <KitModal gear={editingKit === "new" ? null : editingKit} onClose={() => setEditingKit(null)} onSaved={kitSaved} />
      )}
      {editingGoal && (
        <GoalModal
          goal={editingGoal === "new" ? null : editingGoal}
          exerciseNames={progress.map((p) => p.name)}
          workouts={workouts ?? []}
          weights={weights}
          onClose={() => setEditingGoal(null)}
          onSaved={goalSaved}
        />
      )}
    </div>
  );
}

function EmptyState({ title, body, onLog }: { title: string; body: string; onLog?: () => void }) {
  return (
    <Tile className="p-[22px]">
      <SectionTitle>{title}</SectionTitle>
      <p className="text-glass-3 text-sm">{body}</p>
      {onLog && (
        <Button variant="primary" className="mt-4" onClick={onLog}>
          Log a workout
        </Button>
      )}
    </Tile>
  );
}

// ── Overview: consistency ──────────────────────────────────────────────────

function Overview({
  workouts,
  goal,
  onGoal,
  pbWorkouts,
  onLog,
  onEdit,
  onDelete,
  goalsTile,
  kitNames,
}: {
  workouts: Workout[];
  goal: number;
  onGoal: (n: number) => void;
  pbWorkouts: Set<string>;
  onLog: () => void;
  onEdit: (w: Workout) => void;
  onDelete: (w: Workout) => void;
  goalsTile?: ReactNode;
  kitNames?: Map<string, string>;
}) {
  const [showAll, setShowAll] = useState(false);
  const weeks = useMemo(() => weeklySummary(workouts, 12), [workouts]);
  const thisWeek = weeks[weeks.length - 1];
  const run = streak(weeks, goal);
  const last4 = weeks.slice(-4);
  const last4Count = last4.reduce((s, w) => s + w.workouts, 0);
  const last4Secs = last4.reduce((s, w) => s + w.seconds, 0);
  const year = String(new Date().getUTCFullYear());
  const thisYear = workouts.filter((w) => w.date.startsWith(year));
  const met = thisWeek.workouts >= goal;

  if (workouts.length === 0) {
    return (
      <EmptyState
        title="No workouts yet"
        body="Log your first workout — a gym session, a run, a class — and your weekly progress builds up here."
        onLog={onLog}
      />
    );
  }

  const chart = weeks.map((w, i) => ({
    label: shortDate(w.start),
    workouts: w.workouts,
    minutes: Math.round(w.seconds / 60),
    hit: w.workouts >= goal,
    current: i === weeks.length - 1,
  }));
  const shown = showAll ? workouts : workouts.slice(0, 8);

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <StatTile
          label="This week"
          value={`${thisWeek.workouts} / ${goal}`}
          tone="accent"
          sub={`${met ? "goal hit" : `${goal - thisWeek.workouts} to go`}${thisWeek.seconds ? ` · ${formatMinutes(thisWeek.seconds)}` : ""}`}
        />
        <StatTile
          label="Streak"
          value={`${run} week${run === 1 ? "" : "s"}`}
          tone={run > 0 ? "accent" : "default"}
          sub={`hitting ${goal}+ workouts a week`}
        />
        <StatTile
          label="Last 4 weeks"
          value={`${last4Count} workout${last4Count === 1 ? "" : "s"}`}
          sub={`${(last4Count / 4).toFixed(1)} a week${last4Secs ? ` · ${formatMinutes(last4Secs)}` : ""}`}
        />
        <StatTile
          label={`In ${year}`}
          value={`${thisYear.length} workout${thisYear.length === 1 ? "" : "s"}`}
          sub={formatMinutes(thisYear.reduce((s, w) => s + (w.durationSec ?? 0), 0)) + " logged"}
        />
      </div>

      <Tile className="p-[22px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-glass-2 text-[13px] font-semibold uppercase tracking-[0.06em]">
            Weekly Consistency (last 12 weeks)
          </h2>
          <label className="text-glass-3 flex items-center gap-2 text-[12px]">
            Weekly goal
            <select
              value={goal}
              onChange={(e) => onGoal(Number(e.target.value))}
              className="num py-1 text-[12px]"
              aria-label="Workouts per week goal"
            >
              {Array.from({ length: 14 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} a week
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke={AXIS} fontSize={12} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                formatter={(v: number, _n, item) => [
                  `${v} workout${v === 1 ? "" : "s"}${item.payload.minutes ? ` · ${formatMinutes(item.payload.minutes * 60)}` : ""}`,
                  `Week of ${item.payload.label}`,
                ]}
                labelFormatter={() => ""}
              />
              <ReferenceLine
                y={goal}
                stroke={MUTED}
                strokeDasharray="5 4"
                label={{ value: "goal", position: "insideTopRight", fill: MUTED, fontSize: 11 }}
              />
              <Bar dataKey="workouts" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {chart.map((d) => (
                  <Cell key={d.label} fill={BAR} fillOpacity={d.hit ? 1 : d.current ? 0.55 : 0.3} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-glass-3 mt-2 text-[11px]">
          Solid weeks hit your goal; faded ones fell short. The current week is still in progress, so it
          never breaks your streak.
        </p>
      </Tile>

      {goalsTile}

      <Tile className="p-[22px]">
        <SectionTitle>Recent Workouts</SectionTitle>
        <ul className="divide-y divide-white/10">
          {shown.map((w) => {
            const Icon = KIND_ICONS[w.kind];
            const summary = workoutSummary(w);
            return (
              <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="text-glass-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                    <Icon size={15} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-glass truncate">{w.title || kindInfo(w.kind).label}</span>
                      {pbWorkouts.has(w.id) && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: PB, background: "rgba(255,214,10,0.12)" }}
                        >
                          PB
                        </span>
                      )}
                    </span>
                    <span className="text-glass-3 num block text-xs">
                      {formatDate(w.date)}
                      {summary && ` · ${summary}`}
                      {w.gearId && kitNames?.has(w.gearId) && ` · ${kitNames.get(w.gearId)}`}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs">
                  <button className="text-[color:var(--accent-soft)] hover:underline" onClick={() => onEdit(w)}>
                    edit
                  </button>
                  <button className="text-[#ff6b8a] hover:underline" onClick={() => onDelete(w)}>
                    delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
        {workouts.length > shown.length && (
          <button onClick={() => setShowAll(true)} className="text-[color:var(--accent-soft)] mt-2 text-xs hover:underline">
            Show all {workouts.length} workouts
          </button>
        )}
      </Tile>
    </>
  );
}

// ── Strength ───────────────────────────────────────────────────────────────

function StrengthView({ progress, onLog }: { progress: ExerciseProgress[]; onLog: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  if (progress.length === 0) {
    return (
      <EmptyState
        title="No strength sessions yet"
        body="Log a strength workout with your exercises, sets, reps and weights, and each lift's progress and personal bests appear here."
        onLog={onLog}
      />
    );
  }
  const ex = progress.find((p) => p.key === key) ?? progress[0];
  const first = ex.sessions[0];
  const latest = ex.sessions[ex.sessions.length - 1];
  const change = ex.bodyweight ? latest.bestReps - first.bestReps : latest.bestE1rm - first.bestE1rm;
  const changePct = !ex.bodyweight && first.bestE1rm > 0 ? (change / first.bestE1rm) * 100 : null;
  const chart = ex.sessions.map((s) => ({
    label: shortDate(s.date),
    e1rm: Math.round(s.bestE1rm * 10) / 10,
    top: s.topWeight,
    reps: s.bestReps,
    pb: s.pb,
  }));
  const metric = ex.bodyweight ? "reps" : "e1rm";

  return (
    <>
      <Tile className="p-[22px]">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Field label="Exercise">
            <select value={ex.key} onChange={(e) => setKey(e.target.value)}>
              {progress.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <span className="text-glass-3 num text-xs">
            {ex.sessions.length} session{ex.sessions.length === 1 ? "" : "s"} · last {formatDate(ex.lastDate)}
          </span>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          {ex.bodyweight ? (
            <Metric label="Most reps" value={`${ex.mostReps.reps}`} sub={formatDate(ex.mostReps.date)} />
          ) : (
            <>
              <Metric
                label="Best est. 1-rep max"
                value={kg(Math.round(ex.bestE1rm!.kg * 10) / 10)}
                sub={formatDate(ex.bestE1rm!.date)}
              />
              <Metric
                label="Heaviest set"
                value={`${kg(ex.heaviest!.kg)} × ${ex.heaviest!.reps}`}
                sub={formatDate(ex.heaviest!.date)}
              />
            </>
          )}
          <Metric
            label="Since first session"
            value={
              ex.sessions.length < 2
                ? "—"
                : ex.bodyweight
                  ? `${change >= 0 ? "+" : "−"}${Math.abs(change)} reps`
                  : formatSigned(Math.round(change * 10) / 10, kg)
            }
            color={ex.sessions.length < 2 ? undefined : change >= 0 ? ACCENT : "#ff6b8a"}
            sub={
              ex.sessions.length < 2
                ? "log it again to compare"
                : changePct !== null
                  ? `${changePct >= 0 ? "+" : "−"}${Math.abs(changePct).toFixed(1)}% on est. max`
                  : `best set, ${shortDate(first.date)} → ${shortDate(latest.date)}`
            }
          />
          <Metric
            label="Personal bests"
            value={`${ex.sessions.filter((s) => s.pb).length}`}
            sub="sessions that beat every earlier one"
          />
        </div>

        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} interval="preserveStartEnd" />
              <YAxis
                stroke={AXIS}
                fontSize={12}
                tickLine={false}
                width={52}
                allowDecimals={!ex.bodyweight}
                domain={fittedAxis(chart.flatMap((d) => (ex.bodyweight ? [d.reps] : [d.e1rm, d.top])))?.domain}
                ticks={fittedAxis(chart.flatMap((d) => (ex.bodyweight ? [d.reps] : [d.e1rm, d.top])))?.ticks}
                tickFormatter={(v: number) => (ex.bodyweight ? `${v}` : `${v} kg`)}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number, n: string) => [ex.bodyweight ? `${v} reps` : kg(v), n]}
              />
              {!ex.bodyweight && (
                <Line
                  type="monotone"
                  dataKey="top"
                  name="Heaviest set"
                  stroke={MUTED}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                type="monotone"
                dataKey={metric}
                name={ex.bodyweight ? "Most reps" : "Est. 1-rep max"}
                stroke={ACCENT}
                strokeWidth={2.5}
                isAnimationActive={false}
                dot={(props: { cx?: number; cy?: number; index?: number }) => {
                  const pb = props.index !== undefined && chart[props.index]?.pb;
                  return (
                    <circle
                      key={props.index}
                      cx={props.cx}
                      cy={props.cy}
                      r={pb ? 5 : 3}
                      fill={pb ? PB : ACCENT}
                      stroke="none"
                    />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-glass-3 mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: ACCENT }} />
            {ex.bodyweight ? "Most reps in a set" : "Estimated 1-rep max (best set)"}
          </span>
          {!ex.bodyweight && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 border-t border-dashed" style={{ borderColor: MUTED }} />
              Heaviest set
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PB }} />
            Personal best
          </span>
        </div>
      </Tile>

      <Tile className="p-[22px]">
        <SectionTitle>Personal Bests</SectionTitle>
        <ul className="divide-y divide-white/10">
          {progress.map((p) => (
            <li key={p.key}>
              <button
                onClick={() => setKey(p.key)}
                className={`flex w-full items-center justify-between gap-3 rounded-md px-1.5 py-2.5 text-left text-sm transition-colors hover:bg-white/[0.04] ${
                  p.key === ex.key ? "bg-white/[0.05]" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="text-glass block truncate">{p.name}</span>
                  <span className="text-glass-3 num block text-xs">
                    {p.sessions.length} session{p.sessions.length === 1 ? "" : "s"} · last {formatDate(p.lastDate)}
                  </span>
                </span>
                <span className="num shrink-0 text-right">
                  {p.bodyweight ? (
                    <span className="text-glass">{p.mostReps.reps} reps</span>
                  ) : (
                    <>
                      <span className="text-glass block">
                        {kg(p.heaviest!.kg)} × {p.heaviest!.reps}
                      </span>
                      <span className="text-glass-3 block text-xs">
                        est. max {kg(Math.round(p.bestE1rm!.kg * 10) / 10)}
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Tile>
    </>
  );
}

// ── Cardio ─────────────────────────────────────────────────────────────────

function CardioView({ workouts, onLog }: { workouts: Workout[]; onLog: () => void }) {
  // Kinds actually logged, most recently done first.
  const kinds = useMemo(() => {
    const latest = new Map<WorkoutKind, string>();
    for (const w of workouts) if (CARDIO.includes(w.kind) && !latest.has(w.kind)) latest.set(w.kind, w.date);
    return [...latest.keys()];
  }, [workouts]);
  const [picked, setPicked] = useState<WorkoutKind | null>(null);

  if (kinds.length === 0) {
    return (
      <EmptyState
        title="No runs, rides, swims or walks yet"
        body="Log one with its distance and time, and your weekly distance and pace trend appear here."
        onLog={onLog}
      />
    );
  }
  const kind = picked && kinds.includes(picked) ? picked : kinds[0];
  const sessions = cardioSessions(workouts, kind);
  const bests = cardioBests(sessions, kind);
  const weeks = weeklySummary(
    workouts.filter((w) => w.kind === kind),
    12
  );
  const last4 = weeks.slice(-4);
  const last4Km = last4.reduce((s, w) => s + (w.km[kind] ?? 0), 0);
  const last4Count = last4.reduce((s, w) => s + w.workouts, 0);
  const totalKm = sessions.reduce((s, x) => s + (x.km ?? 0), 0);
  const label = kindInfo(kind).label.toLowerCase();
  const distanceChart = weeks.map((w) => ({ label: shortDate(w.start), km: Math.round((w.km[kind] ?? 0) * 100) / 100 }));
  const paceChart = sessions
    .filter((s) => s.pace !== null)
    .map((s) => ({ label: shortDate(s.date), pace: Math.round(s.pace! * 10) / 10, km: s.km }));
  const higherBetter = paceHigherIsBetter(kind);

  return (
    <>
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => {
            const Icon = KIND_ICONS[k];
            const on = k === kind;
            return (
              <button
                key={k}
                onClick={() => setPicked(k)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
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
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <StatTile
          label="Last 4 weeks"
          value={`${last4Km.toFixed(1)} km`}
          tone="accent"
          sub={`${last4Count} ${label}${last4Count === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Longest"
          value={bests.longest ? `${bests.longest.km.toFixed(2)} km` : "—"}
          sub={bests.longest ? formatDate(bests.longest.date) : undefined}
        />
        <StatTile
          label={higherBetter ? "Fastest speed" : "Best pace"}
          value={bests.fastest ? formatPace(kind, bests.fastest.pace) : "—"}
          tone={bests.fastest ? "accent" : "default"}
          sub={bests.fastest ? formatDate(bests.fastest.date) : "log distance and time"}
        />
        <StatTile label="All time" value={`${totalKm.toFixed(1)} km`} sub={`${sessions.length} ${label}${sessions.length === 1 ? "" : "s"}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tile className="p-[22px]">
          <SectionTitle>Distance per Week</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distanceChart} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke={AXIS} fontSize={12} tickLine={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  formatter={(v: number) => [`${v} km`, "Distance"]}
                  labelFormatter={(l) => `Week of ${l}`}
                />
                <Bar dataKey="km" fill={BAR} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tile>

        <Tile className="p-[22px]">
          <SectionTitle>{higherBetter ? "Speed" : "Pace"} per {kindInfo(kind).label}</SectionTitle>
          {paceChart.length < 2 ? (
            <p className="text-glass-3 py-16 text-center text-sm">
              Log at least two {label}s with a distance and time to see your {higherBetter ? "speed" : "pace"} trend.
            </p>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={paceChart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} interval="preserveStartEnd" />
                    <YAxis
                      stroke={AXIS}
                      fontSize={12}
                      tickLine={false}
                      width={64}
                      // Faster is always up: pace (time per distance) runs top-down.
                      reversed={!higherBetter}
                      domain={["auto", "auto"]}
                      tickFormatter={(v: number) => formatPace(kind, v)}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number, _n, item) => [
                        `${formatPace(kind, v)}${item.payload.km ? ` over ${item.payload.km} km` : ""}`,
                        higherBetter ? "Speed" : "Pace",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="pace"
                      stroke={ACCENT}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-glass-3 mt-2 text-[11px]">
                Higher on the chart is faster.{kind === "run" && " Interval sessions are tracked below instead."}
              </p>
            </>
          )}
        </Tile>
      </div>

      {kind === "run" && <IntervalsSection workouts={workouts} onLog={onLog} />}
    </>
  );
}

// ── Interval runs ──────────────────────────────────────────────────────────

/** How a session went, in one figure: average rep pace, or average rep time for timed efforts. */
function sessionScore(s: IntervalSession): string {
  if (s.stats.avgPace !== null) return `avg ${formatPace("run", s.stats.avgPace)}`;
  if (s.stats.avgRepSec !== null) return `avg ${formatClock(s.stats.avgRepSec)}`;
  return "no times";
}

function IntervalsSection({ workouts, onLog }: { workouts: Workout[]; onLog: () => void }) {
  const sessions = useMemo(() => intervalSessions(workouts), [workouts]);
  const bests = useMemo(() => repBests(workouts), [workouts]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const heading = (
    <div className="pt-2">
      <h2 className="text-[19px] font-semibold tracking-tight text-glass">Intervals</h2>
      <p className="text-glass-3 mt-0.5 text-[13px]">Rep by rep, and how each session shape is coming along.</p>
    </div>
  );
  if (sessions.length === 0) {
    return (
      <>
        {heading}
        <Tile className="p-[22px]">
          <p className="text-glass-3 text-sm">
            Log a run and switch it to <span className="text-glass">Intervals</span> to record each rep (6 × 800 m, a
            pyramid, or timed efforts). Your reps, averages and fastest splits then show up here.
          </p>
          <Button className="mt-4" onClick={onLog}>
            Log an interval session
          </Button>
        </Tile>
      </>
    );
  }

  const newestFirst = [...sessions].reverse();
  const selected = sessions.find((s) => s.workoutId === selectedId) ?? newestFirst[0];
  const listed = showAll ? newestFirst : newestFirst.slice(0, 6);
  const sameShape = sessions.filter((s) => s.key === selected.key);

  // Rep chart: plain times when every rep is the same distance, pace when they
  // differ (a pyramid), and nothing to plot for reps without both.
  const timedReps = selected.reps.filter((r) => r.distanceM && r.durationSec);
  const metric =
    timedReps.length === 0 ? null : timedReps.every((r) => r.distanceM === timedReps[0].distanceM) ? "time" : "pace";
  const fmt = (v: number) => (metric === "time" ? formatClock(v) : formatPace("run", v));
  const repChart = selected.reps.map((r, i) => ({
    rep: i + 1,
    value:
      r.distanceM && r.durationSec ? (metric === "time" ? r.durationSec : r.durationSec / (r.distanceM / 1000)) : null,
    distanceM: r.distanceM,
    durationSec: r.durationSec,
  }));
  const plotted = repChart.flatMap((d) => (d.value === null ? [] : [d.value]));
  const repAvg = metric === "time" ? plotted.reduce((a, b) => a + b, 0) / plotted.length : selected.stats.avgPace;
  const repAxis = fittedAxis(repAvg === null ? plotted : [...plotted, repAvg]);
  const fastest = selected.stats.fastest;

  const trend = sameShape.map((s) => ({
    label: shortDate(s.date),
    value: s.stats.avgPace ?? s.stats.avgRepSec,
    pb: s.pb,
    id: s.workoutId,
  }));
  const trendIsPace = selected.stats.avgPace !== null;
  const trendFmt = (v: number) => (trendIsPace ? formatPace("run", v) : formatClock(v));
  const trendAxis = fittedAxis(trend.flatMap((t) => (t.value === null ? [] : [t.value])));

  return (
    <>
      {heading}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tile className="p-[22px]">
          <SectionTitle>Sessions</SectionTitle>
          <ul className="space-y-1">
            {listed.map((s) => {
              const on = s.workoutId === selected.workoutId;
              return (
                <li key={s.workoutId}>
                  <button
                    onClick={() => setSelectedId(s.workoutId)}
                    aria-pressed={on}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                      on
                        ? "border-[rgb(var(--accent-rgb)/0.45)] bg-[rgb(var(--accent-rgb)/0.12)]"
                        : "border-transparent hover:bg-white/[0.04]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-glass truncate">{s.structure}</span>
                        {s.pb && (
                          <span
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: PB, background: "rgba(255,214,10,0.12)" }}
                          >
                            PB
                          </span>
                        )}
                      </span>
                      <span className="text-glass-3 block truncate text-xs">
                        {formatDate(s.date)}
                        {s.title && ` · ${s.title}`}
                      </span>
                    </span>
                    <span className="num text-glass-2 shrink-0 text-xs">{sessionScore(s)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {newestFirst.length > listed.length && (
            <button onClick={() => setShowAll(true)} className="text-[color:var(--accent-soft)] mt-2 text-xs hover:underline">
              Show all {newestFirst.length} sessions
            </button>
          )}
        </Tile>

        <Tile className="p-[22px]">
          <SectionTitle>
            {/* Keep "800 m" from shouting as "800 M". */}
            <span className="normal-case">{selected.structure}</span> · {shortDate(selected.date)}
          </SectionTitle>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Avg rep" value={selected.stats.avgRepSec !== null ? formatClock(selected.stats.avgRepSec) : "—"} />
            <Metric
              label="Avg pace"
              value={selected.stats.avgPace !== null ? formatPace("run", selected.stats.avgPace) : "—"}
            />
            <Metric
              label="Fastest rep"
              value={fastest !== null && selected.reps[fastest].durationSec ? formatClock(selected.reps[fastest].durationSec!) : "—"}
              sub={fastest !== null ? `rep ${fastest + 1}` : undefined}
              color={fastest !== null ? ACCENT : undefined}
            />
            <Metric
              label="Recovery"
              value={selected.recoverySec ? formatClock(selected.recoverySec) : "—"}
              sub={selected.recoverySec ? "between reps" : undefined}
            />
          </div>
          {metric === null ? (
            <p className="text-glass-3 mt-6 text-sm">
              Give each rep a distance and a time to compare them rep by rep.
            </p>
          ) : (
            <>
              <div className="mt-4 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={repChart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis dataKey="rep" stroke={AXIS} fontSize={12} tickLine={false} tickFormatter={(r: number) => `R${r}`} />
                    <YAxis
                      stroke={AXIS}
                      fontSize={12}
                      tickLine={false}
                      width={metric === "time" ? 48 : 64}
                      reversed
                      domain={repAxis?.domain}
                      ticks={repAxis?.ticks}
                      tickFormatter={fmt}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(r) => `Rep ${r}`}
                      formatter={(v: number, _n, item) => {
                        const d = item.payload as (typeof repChart)[number];
                        return [
                          metric === "time"
                            ? `${formatClock(v)} · ${formatPace("run", v / (d.distanceM! / 1000))}`
                            : `${formatPace("run", v)} · ${formatMetres(d.distanceM!)} in ${formatClock(d.durationSec!)}`,
                          metric === "time" ? "Time" : "Pace",
                        ];
                      }}
                    />
                    {repAvg !== null && (
                      <ReferenceLine
                        y={repAvg}
                        stroke={MUTED}
                        strokeDasharray="5 4"
                        label={{ value: `avg ${fmt(repAvg)}`, position: "insideTopRight", fill: MUTED, fontSize: 11 }}
                      />
                    )}
                    <Line
                      type="linear"
                      dataKey="value"
                      stroke={ACCENT}
                      strokeWidth={2}
                      connectNulls
                      isAnimationActive={false}
                      dot={(p: { cx?: number; cy?: number; index: number }) =>
                        p.cx === undefined || p.cy === undefined ? (
                          <g key={p.index} />
                        ) : (
                          <circle
                            key={p.index}
                            cx={p.cx}
                            cy={p.cy}
                            r={p.index === fastest ? 5 : 3}
                            fill={p.index === fastest ? PB : ACCENT}
                            strokeWidth={0}
                          />
                        )
                      }
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-glass-3 mt-2 text-[11px]">
                {metric === "time" ? "Each rep's time" : "Each rep's pace"}; higher is faster and the fastest rep is
                gold.
                {selected.stats.spreadPace !== null &&
                  ` Fastest and slowest reps were ${Math.round(selected.stats.spreadPace)} s/km apart. The closer, the more even your pacing.`}
              </p>
            </>
          )}
        </Tile>

        <Tile className="p-[22px]">
          <SectionTitle>
            <span className="normal-case">{selected.structure}</span> over time
          </SectionTitle>
          {trend.length < 2 ? (
            <p className="text-glass-3 py-12 text-center text-sm">
              Run {selected.structure} again to see whether your {trendIsPace ? "average pace" : "average rep time"} is
              coming down.
            </p>
          ) : (
            <>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                    <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} interval="preserveStartEnd" />
                    <YAxis
                      stroke={AXIS}
                      fontSize={12}
                      tickLine={false}
                      width={trendIsPace ? 64 : 48}
                      reversed
                      domain={trendAxis?.domain}
                      ticks={trendAxis?.ticks}
                      tickFormatter={trendFmt}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [trendFmt(v), trendIsPace ? "Average pace" : "Average rep"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={ACCENT}
                      strokeWidth={2.5}
                      connectNulls
                      isAnimationActive={false}
                      dot={(p: { cx?: number; cy?: number; index: number }) =>
                        p.cx === undefined || p.cy === undefined ? (
                          <g key={p.index} />
                        ) : (
                          <circle
                            key={p.index}
                            cx={p.cx}
                            cy={p.cy}
                            r={trend[p.index].id === selected.workoutId ? 5 : 3}
                            fill={trend[p.index].pb ? PB : ACCENT}
                            strokeWidth={0}
                          />
                        )
                      }
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-glass-3 mt-2 text-[11px]">Higher is faster; gold sessions beat every one before them.</p>
            </>
          )}
        </Tile>

        <Tile className="p-[22px]">
          <SectionTitle>Fastest Reps</SectionTitle>
          {bests.length === 0 ? (
            <p className="text-glass-3 py-12 text-center text-sm">Reps with a distance and a time show up here.</p>
          ) : (
            <ul className="divide-y divide-white/10">
              {bests.map((b) => (
                <li key={b.distanceM} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-glass w-16 shrink-0">{formatMetres(b.distanceM)}</span>
                  <span className="num text-glass flex-1">{formatClock(b.sec)}</span>
                  <span className="num text-glass-3 hidden text-xs sm:inline">
                    {formatPace("run", b.sec / (b.distanceM / 1000))}
                  </span>
                  <span className="text-glass-3 w-24 shrink-0 text-right text-xs">{formatDate(b.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>
    </>
  );
}

// ── Body weight ────────────────────────────────────────────────────────────

function WeightView({ weights, onChanged }: { weights: BodyWeight[]; onChanged: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [value, setValue] = useState("");
  const [fat, setFat] = useState("");
  const [saving, setSaving] = useState(false);

  // Logging a day again replaces it, so show what's there for the chosen day
  // rather than silently overwriting it (or quietly dropping its body fat).
  const existing = weights.find((w) => w.date.slice(0, 10) === date);
  useEffect(() => {
    setValue(existing ? String(existing.weightKg) : "");
    setFat(existing?.bodyFatPct != null ? String(existing.bodyFatPct) : "");
  }, [date, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const log = async (e: FormEvent) => {
    e.preventDefault();
    const weightKg = Number(value);
    if (!value.trim() || !Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400)
      return toast.error("Enter your weight in kg.");
    const bodyFatPct = fat.trim() === "" ? null : Number(fat);
    if (bodyFatPct !== null && (!Number.isFinite(bodyFatPct) || bodyFatPct < 2 || bodyFatPct > 75))
      return toast.error("Body fat should be a percentage between 2 and 75.");
    if (date > today) return toast.error("A weigh-in can't be dated in the future.");
    setSaving(true);
    try {
      await api.logBodyWeight({ date: new Date(date).toISOString(), weightKg, bodyFatPct });
      toast.success(existing ? "Weigh-in updated." : "Weigh-in logged.");
      onChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (w: BodyWeight) => {
    if (!confirm(`Delete the weigh-in from ${formatDate(w.date)}?`)) return;
    await api.deleteBodyWeight(w.id).catch((e) => toast.error((e as Error).message));
    onChanged();
  };

  // Gaining or losing isn't good or bad in itself, so changes stay neutral.
  const signedUnit = (n: number | null, unit: (v: number) => string) =>
    n === null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}${unit(Math.abs(n))}`;
  const pct = (n: number) => `${parseFloat(n.toFixed(1))}%`;

  const latest = weights[weights.length - 1];
  const first = weights[0];
  const trend = movingAverage(weights);
  const chart = weights.map((w, i) => ({ label: shortDate(w.date), kg: w.weightKg, trend: Math.round(trend[i] * 10) / 10 }));
  const axis = fittedAxis(chart.flatMap((d) => [d.kg, d.trend]));

  const fatPoints = weights.filter((w) => w.bodyFatPct != null);
  const fatTrend = movingAverage(weights, 7, byBodyFat);
  const fatChart = fatPoints.map((w, i) => ({
    label: shortDate(w.date),
    pct: w.bodyFatPct!,
    trend: Math.round(fatTrend[i] * 10) / 10,
  }));
  const fatAxis = fittedAxis(fatChart.flatMap((d) => [d.pct, d.trend]));
  const latestFat = fatPoints[fatPoints.length - 1];
  const firstFat = fatPoints[0];

  return (
    <>
      <Tile className="p-[22px]">
        <form onSubmit={log} className="flex flex-wrap items-end gap-3">
          <Field label="Date">
            <input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Weight (kg)">
            <input
              type="number"
              step="any"
              min="20"
              className="num w-28"
              placeholder={latest ? String(latest.weightKg) : "e.g. 80.5"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Field label="Body fat % (optional)">
            <input
              type="number"
              step="any"
              min="2"
              max="75"
              className="num w-28"
              placeholder={latestFat ? String(latestFat.bodyFatPct) : "e.g. 18.5"}
              value={fat}
              onChange={(e) => setFat(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : existing ? "Update weigh-in" : "Log weigh-in"}
          </Button>
          <p className="text-glass-3 w-full text-xs">
            {existing
              ? `You've already logged ${formatDate(existing.date)} — saving replaces it.`
              : "One weigh-in a day. Add body fat if your scale or calipers give you one."}
          </p>
        </form>
      </Tile>

      {weights.length === 0 ? (
        <EmptyState title="No weigh-ins yet" body="Log your weight above and your trend builds up here." />
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
            <StatTile label="Weight" value={kg(latest.weightKg)} tone="accent" sub={formatDate(latest.date)} />
            <StatTile label="Last 30 days" value={signedUnit(weightChange(weights, 30), kg)} sub="vs a month earlier" />
            <StatTile label="Last 90 days" value={signedUnit(weightChange(weights, 90), kg)} sub="vs three months earlier" />
            <StatTile
              label="Since first"
              value={signedUnit(weights.length > 1 ? Math.round((latest.weightKg - first.weightKg) * 10) / 10 : null, kg)}
              sub={`since ${formatDate(first.date)}`}
            />
          </div>

          {weights.length > 1 && (
            <TrendChart
              title="Weight Trend"
              data={chart}
              valueKey="kg"
              valueName="Weigh-in"
              axis={axis}
              unit={kg}
            />
          )}

          {latestFat && (
            <>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
                <StatTile
                  label="Body fat"
                  value={pct(latestFat.bodyFatPct!)}
                  tone="accent"
                  sub={formatDate(latestFat.date)}
                />
                <StatTile
                  label="Body fat, 30 days"
                  value={signedUnit(weightChange(weights, 30, byBodyFat), pct)}
                  sub="vs a month earlier"
                />
                <StatTile
                  label="Body fat, since first"
                  value={signedUnit(
                    fatPoints.length > 1 ? Math.round((latestFat.bodyFatPct! - firstFat.bodyFatPct!) * 10) / 10 : null,
                    pct
                  )}
                  sub={`since ${formatDate(firstFat.date)}`}
                />
                <StatTile
                  label="Lean mass"
                  value={kg(leanMassKg(latestFat.weightKg, latestFat.bodyFatPct!))}
                  sub={
                    fatPoints.length > 1
                      ? `${signedUnit(
                          Math.round(
                            (leanMassKg(latestFat.weightKg, latestFat.bodyFatPct!) -
                              leanMassKg(firstFat.weightKg, firstFat.bodyFatPct!)) *
                              10
                          ) / 10,
                          kg
                        )} since ${shortDate(firstFat.date)}`
                      : "weight that isn't fat"
                  }
                />
              </div>
              {fatPoints.length > 1 && (
                <TrendChart
                  title="Body Fat Trend"
                  data={fatChart}
                  valueKey="pct"
                  valueName="Body fat"
                  axis={fatAxis}
                  unit={pct}
                />
              )}
            </>
          )}

          <Tile className="p-[22px]">
            <SectionTitle>Weigh-ins</SectionTitle>
            <ul className="divide-y divide-white/10">
              {[...weights].reverse().map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="num text-glass-2">{formatDate(w.date)}</span>
                  <span className="flex items-center gap-4">
                    <span className="num text-glass">{kg(w.weightKg)}</span>
                    <span className="num text-glass-3 w-14 text-right">
                      {w.bodyFatPct != null ? pct(w.bodyFatPct) : ""}
                    </span>
                    <button className="text-xs text-[#ff6b8a] hover:underline" onClick={() => remove(w)}>
                      delete
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </Tile>
        </>
      )}
    </>
  );
}

/** Readings as faint dots with a smoothed trend line through them. */
function TrendChart({
  title,
  data,
  valueKey,
  valueName,
  axis,
  unit,
}: {
  title: string;
  data: { label: string; trend: number }[];
  valueKey: string;
  valueName: string;
  axis: { domain: [number, number]; ticks: number[] } | undefined;
  unit: (v: number) => string;
}) {
  return (
    <Tile className="p-[22px]">
      <SectionTitle>{title}</SectionTitle>
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} interval="preserveStartEnd" />
            <YAxis
              stroke={AXIS}
              fontSize={12}
              tickLine={false}
              width={56}
              domain={axis?.domain}
              ticks={axis?.ticks}
              tickFormatter={unit}
            />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [unit(v), n]} />
            <Line
              type="monotone"
              dataKey={valueKey}
              name={valueName}
              stroke={MUTED}
              strokeWidth={1}
              dot={{ r: 2.5, fill: MUTED, strokeWidth: 0 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="trend"
              name="Trend"
              stroke={ACCENT}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-glass-3 mt-2 text-[11px]">
        The trend line averages your last 7 readings, smoothing out day-to-day swings.
      </p>
    </Tile>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
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
