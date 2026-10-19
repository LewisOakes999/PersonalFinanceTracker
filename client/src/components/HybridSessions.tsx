import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HybridSegment, Workout } from "../types";
import { Button, SectionTitle, StatTile, Tile } from "./ui";
import { formatClock, formatMetres, formatPace, formatVolume, hybridSessions, weekStart, type HybridSession } from "../lib/fitness";
import { clockAxis } from "../lib/chart";
import { formatDate } from "../lib/format";
import { tooltipStyle } from "../pages/Dashboard";

const ACCENT = "var(--accent-soft)";
const BAR = "rgb(var(--accent-rgb))";
const STATION = "rgba(245,245,247,0.35)";
const PB = "#ffd60a";
const AXIS = "rgba(245,245,247,0.45)";
const DAY_MS = 24 * 60 * 60 * 1000;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const km = (n: number) => `${parseFloat(n.toFixed(2))} km`;

/** What a segment was, in a few words: "1 km run", "Wall Balls · 100 × 6 kg". */
function segmentText(x: HybridSegment): string {
  if (x.type === "run") return x.distanceM ? `${formatMetres(x.distanceM)} run` : "Run";
  const parts = [
    x.reps ? `${x.reps}${x.weightKg ? ` × ${x.weightKg} kg` : " reps"}` : null,
    x.distanceM ? formatMetres(x.distanceM) : null,
  ].filter(Boolean);
  return parts.length ? `${x.exercise} · ${parts.join(" · ")}` : x.exercise;
}

/** Hybrid sessions in Cardio: each session's splits, and how each shape (a Hyrox, say) is going. */
export function HybridView({ workouts, onLog }: { workouts: Workout[]; onLog: () => void }) {
  const sessions = useMemo(() => hybridSessions(workouts), [workouts]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (sessions.length === 0) {
    return (
      <Tile className="p-[22px]">
        <SectionTitle>No hybrid sessions yet</SectionTitle>
        <p className="text-glass-3 text-sm">
          Log a Hybrid workout (runs with stations in between, like a Hyrox) and its splits and times show up here.
        </p>
        <Button variant="primary" className="mt-4" onClick={onLog}>
          Log a workout
        </Button>
      </Tile>
    );
  }

  const newestFirst = [...sessions].reverse();
  const selected = sessions.find((s) => s.workoutId === selectedId) ?? newestFirst[0];
  const listed = showAll ? newestFirst : newestFirst.slice(0, 6);
  const sameShape = sessions.filter((s) => s.key === selected.key);
  const best = sameShape.reduce<HybridSession | null>(
    (b, s) => (s.totalSec !== null && (!b || s.totalSec < b.totalSec!) ? s : b),
    null
  );

  // The last four weeks, this one included, as on the other cardio views.
  const from = new Date(weekStart(new Date()).getTime() - 21 * DAY_MS).toISOString();
  const recent = sessions.filter((s) => s.date >= from);
  const runKm = (ss: HybridSession[]) => ss.reduce((t, s) => t + s.summary.runKm, 0);

  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <StatTile
          label="Last 4 weeks"
          value={`${recent.length} session${recent.length === 1 ? "" : "s"}`}
          tone="accent"
          sub={`${km(runKm(recent))} running`}
        />
        <StatTile
          label={`Best ${selected.name}`}
          value={best ? formatClock(best.totalSec!) : "—"}
          tone={best ? "accent" : "default"}
          sub={best ? formatDate(best.date) : "log a time to compare"}
        />
        <StatTile
          label="All time"
          value={`${sessions.length} session${sessions.length === 1 ? "" : "s"}`}
          sub={`${km(runKm(sessions))} running`}
        />
      </div>

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
                        <span className="text-glass truncate">{s.title || s.name}</span>
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
                        {s.title && ` · ${s.name}`}
                      </span>
                    </span>
                    <span className="num text-glass-2 shrink-0 text-xs">
                      {s.totalSec !== null ? formatClock(s.totalSec) : "no time"}
                    </span>
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

        <SessionSplits s={selected} />

        <ShapeTrend sessions={sameShape} selected={selected} />
      </div>
    </>
  );
}

/** The selected session: its figures, and each run and station's time. */
function SessionSplits({ s }: { s: HybridSession }) {
  const h = s.summary;
  let runs = 0;
  let stations = 0;
  const data = s.segments.map((x) => ({
    label: x.type === "run" ? `R${++runs}` : `S${++stations}`,
    sec: x.durationSec,
    run: x.type === "run",
    text: segmentText(x),
  }));
  const timed = data.some((d) => d.sec);

  return (
    <Tile className="p-[22px]">
      <SectionTitle>
        <span className="normal-case">{s.title || s.name}</span> · {shortDate(s.date)}
      </SectionTitle>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Time" value={s.totalSec !== null ? formatClock(s.totalSec) : "—"} />
        <Figure label="Run pace" value={h.runPace !== null ? formatPace("run", h.runPace) : "—"} sub="between stations" />
        <Figure label="Running" value={h.runKm ? km(h.runKm) : "—"} sub={`${h.runs} run${h.runs === 1 ? "" : "s"}`} />
        <Figure
          label="Stations"
          value={String(h.stations)}
          sub={h.volume > 0 ? `${formatVolume(h.volume)} volume` : undefined}
        />
      </div>
      {timed ? (
        <>
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} interval="preserveStartEnd" />
                <YAxis stroke={AXIS} fontSize={11} tickLine={false} width={44} tickFormatter={(v: number) => formatClock(v)} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  labelFormatter={() => ""}
                  formatter={(v: number, _n, item) => [formatClock(v), item.payload.text]}
                />
                <Bar dataKey="sec" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.label} fill={d.run ? BAR : STATION} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-glass-3 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: BAR }} /> Runs
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: STATION }} /> Stations
            </span>
            <span>Each bar is one split, in the order you did them.</span>
          </div>
        </>
      ) : (
        <p className="text-glass-3 mt-6 text-sm">Add the time for each run and station to see your splits.</p>
      )}
    </Tile>
  );
}

/** Total time for every session of the selected one's shape — is it coming down? */
function ShapeTrend({ sessions, selected }: { sessions: HybridSession[]; selected: HybridSession }) {
  const timed = sessions.filter((s) => s.totalSec !== null);
  const data = timed.map((s) => ({ label: shortDate(s.date), sec: s.totalSec!, pb: s.pb, id: s.workoutId }));
  const axis = clockAxis(data.map((d) => d.sec));

  return (
    <Tile className="p-[22px] lg:col-span-2">
      <SectionTitle>
        <span className="normal-case">{selected.name}</span> over time
      </SectionTitle>
      {data.length < 2 ? (
        <p className="text-glass-3 py-8 text-center text-sm">
          Log another {selected.name === "Hyrox" ? "Hyrox" : "session like this one"} with its time to see whether
          you're getting quicker.
        </p>
      ) : (
        <>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
                <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} interval="preserveStartEnd" />
                <YAxis
                  stroke={AXIS}
                  fontSize={12}
                  tickLine={false}
                  width={56}
                  reversed
                  domain={axis?.domain}
                  ticks={axis?.ticks}
                  tickFormatter={(v: number) => formatClock(v)}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatClock(v), "Time"]} />
                <Line
                  type="monotone"
                  dataKey="sec"
                  stroke={ACCENT}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={(p: { cx?: number; cy?: number; index: number }) =>
                    p.cx === undefined || p.cy === undefined ? (
                      <g key={p.index} />
                    ) : (
                      <circle
                        key={p.index}
                        cx={p.cx}
                        cy={p.cy}
                        r={data[p.index].id === selected.workoutId ? 5 : 3}
                        fill={data[p.index].pb ? PB : ACCENT}
                        strokeWidth={0}
                      />
                    )
                  }
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-glass-3 mt-2 text-[11px]">Higher is quicker; gold sessions beat every one before them.</p>
        </>
      )}
    </Tile>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-glass-3 text-[11px] font-medium uppercase tracking-[0.08em]">{label}</div>
      <div className="num text-glass mt-1 text-[18px] font-semibold">{value}</div>
      {sub && <div className="text-glass-3 mt-0.5 text-xs">{sub}</div>}
    </div>
  );
}
