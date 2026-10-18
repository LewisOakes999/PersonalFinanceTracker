import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
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
import { CalendarCheck, Dumbbell, Plus, Route, Scale, type LucideIcon } from "lucide-react";
import { api } from "../api/client";
import type { BodyWeight, Workout, WorkoutKind, WorkoutPreset } from "../types";
import { Button, Field, SectionTitle, StatTile, Tile } from "../components/ui";
import { LogWorkoutModal } from "../components/LogWorkoutModal";
import {
  byBodyFat,
  cardioBests,
  cardioSessions,
  exerciseProgress,
  formatMinutes,
  formatPace,
  kindInfo,
  leanMassKg,
  movingAverage,
  paceHigherIsBetter,
  streak,
  weeklySummary,
  weightChange,
  workoutSummary,
  type ExerciseProgress,
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

type FitTab = "overview" | "strength" | "cardio" | "weight";
const FIT_TABS: { id: FitTab; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: CalendarCheck },
  { id: "strength", label: "Strength", icon: Dumbbell },
  { id: "cardio", label: "Cardio", icon: Route },
  { id: "weight", label: "Body weight", icon: Scale },
];

/** "14 Oct" — for chart axes, where the year is noise. */
const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

// Up to two decimals, so 1.25 kg plate jumps (73.75 kg) show exactly.
const kg = (n: number) => `${parseFloat(n.toFixed(2))} kg`;

export default function Fitness() {
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [weights, setWeights] = useState<BodyWeight[]>([]);
  const [presets, setPresets] = useState<WorkoutPreset[]>([]);
  const [goal, setGoal] = useState(3);
  const [tab, setTab] = useState<FitTab>("overview");
  const [editing, setEditing] = useState<Workout | "new" | null>(null);

  const loadWorkouts = () => api.listWorkouts().then((w) => (setWorkouts(w), w));
  const loadWeights = () => api.listBodyWeights().then(setWeights);
  const loadPresets = () => api.listPresets().then(setPresets).catch(() => setPresets([]));
  useEffect(() => {
    loadPresets();
    loadWorkouts().catch((e) => toast.error((e as Error).message));
    loadWeights().catch(() => setWeights([]));
    api
      .getSettings()
      .then((s) => setGoal(s.weeklyWorkoutGoal ?? 3))
      .catch(() => {});
  }, []);

  const progress = useMemo(() => exerciseProgress(workouts ?? []), [workouts]);

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
    if (pbs.length > 0) toast.success(`New PB: ${pbs.join(", ")}`);
    else toast.success(wasEdit ? "Workout updated." : "Workout logged.");
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
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">Fitness</h1>
          <p className="text-glass-3 mt-1 text-[13px]">Your workouts, and how you're progressing</p>
        </div>
        <Button variant="primary" className="inline-flex items-center gap-1.5" onClick={() => setEditing("new")}>
          <Plus size={14} strokeWidth={2} /> Log Workout
        </Button>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist">
        {FIT_TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-[rgb(var(--accent-rgb)/0.5)] bg-[rgb(var(--accent-rgb)/0.18)] text-white"
                  : "border-white/10 bg-white/5 text-glass-2 hover:bg-white/10 hover:text-glass"
              }`}
            >
              <t.icon size={14} strokeWidth={2} />
              {t.label}
            </button>
          );
        })}
      </div>

      {workouts && tab === "overview" && (
        <Overview
          workouts={workouts}
          goal={goal}
          onGoal={changeGoal}
          pbWorkouts={new Set(progress.flatMap((p) => p.sessions.filter((s) => s.pb).map((s) => s.workoutId)))}
          onLog={() => setEditing("new")}
          onEdit={setEditing}
          onDelete={remove}
        />
      )}
      {workouts && tab === "strength" && <StrengthView progress={progress} onLog={() => setEditing("new")} />}
      {workouts && tab === "cardio" && <CardioView workouts={workouts} onLog={() => setEditing("new")} />}
      {tab === "weight" && <WeightView weights={weights} onChanged={loadWeights} />}

      {editing && (
        <LogWorkoutModal
          workout={editing === "new" ? null : editing}
          exerciseNames={progress.map((p) => p.name)}
          presets={presets}
          onPresetsChanged={loadPresets}
          onClose={() => setEditing(null)}
          onSaved={saved}
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
}: {
  workouts: Workout[];
  goal: number;
  onGoal: (n: number) => void;
  pbWorkouts: Set<string>;
  onLog: () => void;
  onEdit: (w: Workout) => void;
  onDelete: (w: Workout) => void;
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
              <p className="text-glass-3 mt-2 text-[11px]">Higher on the chart is faster.</p>
            </>
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
