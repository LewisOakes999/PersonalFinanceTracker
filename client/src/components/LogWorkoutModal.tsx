import { useEffect, useId, useMemo, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { BookmarkPlus, Dumbbell, Footprints, Plus, X } from "lucide-react";
import { api } from "../api/client";
import type { Gear, HybridSegment, IntervalRep, Workout, WorkoutKind, WorkoutPreset, WorkoutSet } from "../types";
import { toast } from "../lib/toast";
import { Button, Field, Modal } from "./ui";
import {
  KINDS,
  formatClock,
  formatPace,
  formatVolume,
  HYROX,
  hybridSummary,
  intervalStats,
  intervalStructure,
  isCardio,
  joinDuration,
  kindInfo,
  paceLabel,
  splitDuration,
  type DurationParts,
} from "../lib/fitness";
import { KIND_ICONS } from "../lib/fitnessIcons";
import { suits } from "../lib/kit";

type SetRow = { reps: string; weight: string };
type ExerciseBlock = { id: number; name: string; sets: SetRow[] };

type RepRow = { id: number; distance: string; m: string; s: string };

/** A hybrid session's run or station as typed. */
type SegRow = {
  id: number;
  type: "run" | "station";
  name: string;
  distance: string;
  reps: string;
  weight: string;
  m: string;
  s: string;
};

/** Kinds timed to the second: cardio for its pace, hybrid for its finish time. */
const timedKind = (k: WorkoutKind) => isCardio(k) || k === "hybrid";

let nextId = 1;
const repRow = (distance = "", sec: number | null = null): RepRow => ({
  id: nextId++,
  distance,
  m: sec ? String(Math.floor(sec / 60)) : "",
  s: sec ? String(sec % 60) : "",
});
const toRepRows = (intervals: IntervalRep[]) =>
  intervals.map((r) => repRow(r.distanceM ? String(r.distanceM) : "", r.durationSec));
const emptyBlock = (): ExerciseBlock => ({ id: nextId++, name: "", sets: [{ reps: "", weight: "" }] });

const segRow = (seg: HybridSegment | { type: "run" | "station" }): SegRow => {
  const x = seg as Partial<Extract<HybridSegment, { type: "station" }>> & { type: "run" | "station" };
  const sec = x.durationSec ?? null;
  return {
    id: nextId++,
    type: seg.type,
    name: x.exercise ?? "",
    distance: x.distanceM ? String(x.distanceM) : "",
    reps: x.reps ? String(x.reps) : "",
    weight: x.weightKg ? String(x.weightKg) : "",
    m: sec ? String(Math.floor(sec / 60)) : "",
    s: sec ? String(sec % 60) : "",
  };
};
/** Stored segments back into rows; a new session starts with a run and a station to fill in. */
const toSegRows = (segments: HybridSegment[]) =>
  segments.length > 0 ? segments.map(segRow) : [segRow({ type: "run" }), segRow({ type: "station" })];
const segBlank = (r: SegRow) => ![r.name, r.distance, r.reps, r.weight, r.m, r.s].some((v) => v.trim());

/** An exercise's volume (reps × kg) and reps as typed so far, skipping unreadable sets. */
function blockVolume(b: ExerciseBlock) {
  let volume = 0;
  let reps = 0;
  for (const s of b.sets) {
    const r = Number(s.reps);
    const w = s.weight.trim() === "" ? 0 : Number(s.weight);
    if (!s.reps.trim() || !Number.isFinite(r) || r <= 0 || !Number.isFinite(w) || w < 0) continue;
    volume += r * w;
    reps += r;
  }
  return { volume, reps };
}

/** Stored sets (a workout's or a preset's) back into one block per exercise, in order. */
function toBlocks(w: { kind: WorkoutKind; sets: WorkoutSet[] } | null): ExerciseBlock[] {
  if (!w || w.kind !== "strength" || w.sets.length === 0) return [emptyBlock()];
  const blocks: ExerciseBlock[] = [];
  for (const s of w.sets) {
    const last = blocks[blocks.length - 1];
    const row = { reps: String(s.reps), weight: s.weightKg ? String(s.weightKg) : "" };
    if (last && last.name.trim().toLowerCase() === s.exercise.trim().toLowerCase()) last.sets.push(row);
    else blocks.push({ id: nextId++, name: s.exercise, sets: [row] });
  }
  return blocks;
}

/** Log a workout, or edit one. The form adapts to the kind of workout. */
export function LogWorkoutModal({
  workout,
  exerciseNames,
  presets,
  onPresetsChanged,
  onClose,
  onSaved,
  gear = [],
  defaultGear,
}: {
  workout: Workout | null;
  exerciseNames: string[];
  presets: WorkoutPreset[];
  onPresetsChanged: () => void;
  onClose: () => void;
  onSaved: (saved: Workout) => void;
  /** All your kit; the form offers what's in use for the kind. */
  gear?: Gear[];
  /** What to pick for a new workout of a kind — usually what you used last time. */
  defaultGear?: (kind: WorkoutKind) => string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<WorkoutKind>(workout?.kind ?? "strength");
  const [date, setDate] = useState(workout ? workout.date.slice(0, 10) : today);
  const [dur, setDur] = useState<DurationParts>(() =>
    splitDuration(workout?.durationSec ?? null, timedKind(workout?.kind ?? "strength"))
  );
  const [title, setTitle] = useState(workout?.title ?? "");
  const [distance, setDistance] = useState(workout?.distanceKm ? String(workout.distanceKm) : "");
  // Interval runs: reps rather than one steady effort.
  const [runMode, setRunMode] = useState<"steady" | "intervals">(
    workout && workout.intervals.length > 0 ? "intervals" : "steady"
  );
  const [reps, setReps] = useState<RepRow[]>(() => toRepRows(workout?.intervals ?? []));
  const [recovery, setRecovery] = useState<DurationParts>(() =>
    splitDuration(workout?.recoverySec ?? null, true)
  );
  const [segs, setSegs] = useState<SegRow[]>(() => toSegRows(workout?.segments ?? []));
  const [quickCount, setQuickCount] = useState("6");
  const [quickDistance, setQuickDistance] = useState("800");
  const [notes, setNotes] = useState(workout?.notes ?? "");
  const [gearId, setGearId] = useState<string | null>(() =>
    workout ? workout.gearId : (defaultGear?.("strength") ?? null)
  );
  const [blocks, setBlocks] = useState<ExerciseBlock[]>(() => toBlocks(workout));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Presets: which one the form was filled from, and the save-as-preset panel.
  const [applied, setApplied] = useState<string | null>(null);
  const [managing, setManaging] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetSaving, setPresetSaving] = useState(false);

  // A new workout picks up the kit you last used for its kind; an edit keeps its own.
  useEffect(() => {
    if (!workout) setGearId(defaultGear?.(kind) ?? null);
  }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const kitOptions = gear.filter((g) => (!g.retiredAt && suits(g, kind)) || g.id === workout?.gearId);

  const info = kindInfo(kind);
  // Runs, rides, swims, walks and hybrid sessions have a seconds box — their pace or finish time needs it.
  const timed = timedKind(kind);
  const seconds = joinDuration({ ...dur, s: timed ? dur.s : "" });
  const durationLabelId = useId();
  const km = distance.trim() === "" ? null : Number(distance);
  const intervalMode = kind === "run" && runMode === "intervals";
  // Rows as reps: untouched rows are skipped; NaN marks something unreadable.
  const parsedReps = reps
    .filter((r) => r.distance.trim() || r.m.trim() || r.s.trim())
    .map((r) => ({
      distanceM: r.distance.trim() === "" ? null : Number(r.distance),
      durationSec: joinDuration({ h: "", m: r.m, s: r.s }),
    }));
  const readableReps = parsedReps.filter(
    (r) =>
      (r.distanceM === null || (Number.isInteger(r.distanceM) && r.distanceM > 0)) &&
      !Number.isNaN(r.durationSec as number)
  ) as IntervalRep[];
  const repsKm = readableReps.reduce((sum, r) => sum + (r.distanceM ?? 0), 0) / 1000;
  const pace = isCardio(kind) ? paceLabel(kind, km, seconds !== null && !Number.isNaN(seconds) ? seconds : null) : null;

  const updateBlock = (id: number, change: (b: ExerciseBlock) => ExerciseBlock) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? change(b) : b)));

  // Exercise suggestions: everything logged before, plus names typed in this form.
  const suggestions = useMemo(
    () => [...new Set([...exerciseNames, ...blocks.map((b) => b.name.trim()).filter(Boolean)])],
    [exerciseNames, blocks]
  );

  /**
   * The form as a workout (everything but date and notes), or null with an
   * error shown. Shared by logging and saving as a preset, so both check alike.
   */
  const collect = () => {
    setError("");
    if (seconds !== null && Number.isNaN(seconds)) {
      setError("Enter the duration as whole hours and minutes" + (timed ? " (and seconds)." : "."));
      return null;
    }
    if (seconds !== null && seconds > 24 * 60 * 60) {
      setError("That's longer than a day — check the duration.");
      return null;
    }

    // A name matching an earlier exercise (in any case) takes its existing
    // spelling, so "bench press" doesn't rename "Bench press" everywhere.
    const known = new Map(exerciseNames.map((n) => [n.trim().toLowerCase(), n]));
    const canonical = (name: string) => known.get(name.trim().toLowerCase()) ?? name.trim();

    let sets: { exercise: string; reps: number; weightKg: number }[] = [];
    if (kind === "strength") {
      for (const b of blocks) {
        const filled = b.sets.filter((s) => s.reps.trim() !== "" || s.weight.trim() !== "");
        if (!b.name.trim() && filled.length === 0) continue; // an untouched block
        if (!b.name.trim()) {
          setError("Give every exercise a name.");
          return null;
        }
        for (const s of filled) {
          const reps = Number(s.reps);
          const weightKg = s.weight.trim() === "" ? 0 : Number(s.weight);
          if (!Number.isInteger(reps) || reps < 1) {
            setError(`Enter the reps for each set of ${b.name.trim()}.`);
            return null;
          }
          if (!Number.isFinite(weightKg) || weightKg < 0) {
            setError(`Check the weights for ${b.name.trim()}.`);
            return null;
          }
          sets.push({ exercise: canonical(b.name), reps, weightKg });
        }
      }
      if (sets.length === 0) {
        setError("Add at least one exercise with a set.");
        return null;
      }
    } else {
      sets = [];
    }
    if (isCardio(kind) && km !== null && (!Number.isFinite(km) || km <= 0)) {
      setError("Enter the distance in km.");
      return null;
    }
    // Hybrid: each run and station in order; untouched rows are skipped.
    const segments: HybridSegment[] = [];
    if (kind === "hybrid") {
      let runs = 0;
      let stations = 0;
      for (const r of segs) {
        if (segBlank(r)) continue;
        const label = r.type === "run" ? `Run ${++runs}` : r.name.trim() || `Station ${++stations}`;
        const distanceM = r.distance.trim() === "" ? null : Number(r.distance);
        if (distanceM !== null && (!Number.isInteger(distanceM) || distanceM < 1)) {
          setError(`${label}: enter the distance in whole metres.`);
          return null;
        }
        const durationSec = joinDuration({ h: "", m: r.m, s: r.s });
        if (durationSec !== null && Number.isNaN(durationSec)) {
          setError(`${label}: enter the time as minutes and seconds.`);
          return null;
        }
        if (r.type === "run") {
          if (distanceM === null && durationSec === null) {
            setError(`${label}: add a distance or a time.`);
            return null;
          }
          segments.push({ type: "run", distanceM, durationSec });
          continue;
        }
        if (!r.name.trim()) {
          setError("Give every station a name, like Wall Balls.");
          return null;
        }
        const reps = r.reps.trim() === "" ? null : Number(r.reps);
        if (reps !== null && (!Number.isInteger(reps) || reps < 1)) {
          setError(`${label}: enter the reps as a whole number.`);
          return null;
        }
        const weightKg = r.weight.trim() === "" ? null : Number(r.weight);
        if (weightKg !== null && (!Number.isFinite(weightKg) || weightKg < 0)) {
          setError(`${label}: check the weight.`);
          return null;
        }
        if (reps === null && distanceM === null && durationSec === null) {
          setError(`${label}: add reps, a distance or a time.`);
          return null;
        }
        segments.push({ type: "station", exercise: canonical(r.name), reps, weightKg, distanceM, durationSec });
      }
      if (segments.length === 0) {
        setError("Add at least one run or station.");
        return null;
      }
    }

    let intervals: IntervalRep[] = [];
    let recoverySec: number | null = null;
    if (intervalMode) {
      if (parsedReps.length === 0) {
        setError("Add at least one rep — a distance, a time, or both.");
        return null;
      }
      for (const [i, r] of parsedReps.entries()) {
        if (r.distanceM !== null && (!Number.isInteger(r.distanceM) || r.distanceM < 1)) {
          setError(`Rep ${i + 1}: enter the distance in whole metres.`);
          return null;
        }
        if (Number.isNaN(r.durationSec as number)) {
          setError(`Rep ${i + 1}: enter the time as minutes and seconds.`);
          return null;
        }
      }
      intervals = parsedReps as IntervalRep[];
      recoverySec = joinDuration({ h: "", m: recovery.m, s: recovery.s });
      if (recoverySec !== null && Number.isNaN(recoverySec)) {
        setError("Enter the recovery as minutes and seconds.");
        return null;
      }
    }
    return {
      kind,
      title: title.trim(),
      durationSec: seconds,
      distanceKm: isCardio(kind) ? km : null,
      sets,
      intervals,
      recoverySec,
      segments,
      gearId: kitOptions.some((g) => g.id === gearId) ? gearId : null,
    };
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!date) return setError("Pick a date.");
    if (date > today) return setError("A workout can't be dated in the future.");
    const data = collect();
    if (!data) return;
    const payload = { ...data, date: new Date(date).toISOString(), notes: notes.trim() || null };
    setSaving(true);
    try {
      const saved = workout
        ? await api.updateWorkout(workout.id, payload)
        : await api.createWorkout(payload);
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  /** Fill the form from a preset — the date and notes stay as they are. */
  const applyPreset = (p: WorkoutPreset) => {
    setKind(p.kind);
    setTitle(p.title);
    setDur(splitDuration(p.durationSec, timedKind(p.kind)));
    setDistance(p.distanceKm ? String(p.distanceKm) : "");
    setBlocks(toBlocks(p));
    setRunMode(p.intervals.length > 0 ? "intervals" : "steady");
    setReps(toRepRows(p.intervals));
    setRecovery(splitDuration(p.recoverySec, true));
    setSegs(toSegRows(p.segments ?? []));
    setApplied(p.id);
    setError("");
  };

  const removePreset = async (p: WorkoutPreset) => {
    if (!confirm(`Delete the “${p.name}” preset? Workouts you've logged from it are kept.`)) return;
    try {
      await api.deletePreset(p.id);
      if (applied === p.id) setApplied(null);
      onPresetsChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Saving under an existing name (in any case) updates that preset.
  const matching = presets.find((p) => p.name.toLowerCase() === presetName.trim().toLowerCase());
  // Suggest updating the preset the form came from only while it's still that
  // workout (same type and name) — otherwise suggest a new one, so switching a
  // loaded "Push day" to a run doesn't offer to overwrite "Push day".
  const openPresetPanel = () => {
    const from = presets.find((p) => p.id === applied);
    const stillThatPreset = from && from.kind === kind && from.title === title.trim();
    setPresetName(stillThatPreset ? from.name : title.trim() || info.label);
    setPresetOpen(true);
  };
  const savePreset = async () => {
    const data = collect();
    if (!data) return;
    const name = matching?.name ?? presetName.trim();
    if (!name) return setError("Give the preset a name.");
    setPresetSaving(true);
    try {
      const saved = await api.savePreset({ ...data, name });
      toast.success(matching ? `Preset “${name}” updated.` : `Saved “${name}” as a preset.`);
      setApplied(saved.id);
      setPresetOpen(false);
      onPresetsChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPresetSaving(false);
    }
  };
  // Enter in the name box saves the preset — it must not log the workout.
  const presetKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      savePreset();
    }
  };

  return (
    <Modal title={workout ? "Edit Workout" : "Log Workout"} onClose={onClose} opaque>
      <form onSubmit={submit} className="space-y-4">
        {!workout && presets.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-glass-3 text-xs uppercase tracking-wider">Start from a preset</span>
              <button
                type="button"
                onClick={() => setManaging((m) => !m)}
                className="text-glass-3 hover:text-glass text-[11px]"
              >
                {managing ? "Done" : "Manage"}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => {
                const Icon = KIND_ICONS[p.kind];
                const on = applied === p.id;
                return (
                  <span
                    key={p.id}
                    className={`inline-flex items-center rounded-lg border text-xs font-medium transition-colors ${
                      on
                        ? "border-[rgb(var(--accent-rgb)/0.6)] bg-[rgb(var(--accent-rgb)/0.18)] text-white"
                        : "border-white/10 bg-white/5 text-glass-2"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => applyPreset(p)}
                      disabled={managing}
                      className="hover:text-glass inline-flex items-center gap-1.5 px-2.5 py-1.5 disabled:cursor-default"
                    >
                      <Icon size={13} strokeWidth={1.75} /> {p.name}
                    </button>
                    {managing && (
                      <button
                        type="button"
                        onClick={() => removePreset(p)}
                        className="text-glass-3 hover:text-[#ff6b8a] pr-2"
                        aria-label={`Delete preset ${p.name}`}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Kind of workout">
          {KINDS.map((k) => {
            const Icon = KIND_ICONS[k.id];
            const on = kind === k.id;
            return (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(k.id)}
                className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs transition-colors ${
                  on
                    ? "border-[rgb(var(--accent-rgb)/0.6)] bg-[rgb(var(--accent-rgb)/0.18)] text-white"
                    : "border-white/10 bg-white/5 text-glass-3 hover:text-glass"
                }`}
              >
                <Icon size={16} strokeWidth={1.75} />
                {k.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date">
            <input type="date" className="w-full" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div role="group" aria-labelledby={durationLabelId}>
            <span id={durationLabelId} className="text-glass-3 mb-1 block text-xs uppercase tracking-wider">
              Duration (optional)
            </span>
            <div className="flex items-center gap-2">
              <DurationBox
                label="Hours"
                unit="h"
                placeholder="0"
                value={dur.h}
                onChange={(h) => setDur((d) => ({ ...d, h }))}
              />
              <DurationBox
                label="Minutes"
                unit="m"
                placeholder={timed ? "25" : "45"}
                value={dur.m}
                onChange={(m) => setDur((d) => ({ ...d, m }))}
              />
              {timed && (
                <DurationBox
                  label="Seconds"
                  unit="s"
                  placeholder="00"
                  value={dur.s}
                  onChange={(v) => setDur((d) => ({ ...d, s: v }))}
                />
              )}
            </div>
          </div>
        </div>

        <div className={kitOptions.length > 0 ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : ""}>
          <Field label="Name (optional)">
            <input className="w-full" placeholder={info.placeholder} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {kitOptions.length > 0 && (
            <Field label="Kit">
              <select className="w-full" value={gearId ?? ""} onChange={(e) => setGearId(e.target.value || null)}>
                <option value="">None</option>
                {kitOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.retiredAt ? " (retired)" : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {kind === "run" && (
          <div className="flex gap-1" role="radiogroup" aria-label="Kind of run">
            {(["steady", "intervals"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={runMode === m}
                onClick={() => setRunMode(m)}
                className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  runMode === m
                    ? "border-[rgb(var(--accent-rgb)/0.6)] bg-[rgb(var(--accent-rgb)/0.18)] text-white"
                    : "border-white/10 bg-white/5 text-glass-3 hover:text-glass"
                }`}
              >
                {m === "steady" ? "Steady run" : "Intervals"}
              </button>
            ))}
          </div>
        )}

        {kind === "hybrid" && <HybridEditor rows={segs} setRows={setSegs} exerciseNames={exerciseNames} />}

        {intervalMode && (
          <IntervalsEditor
            reps={reps}
            setReps={setReps}
            recovery={recovery}
            setRecovery={setRecovery}
            quickCount={quickCount}
            setQuickCount={setQuickCount}
            quickDistance={quickDistance}
            setQuickDistance={setQuickDistance}
            summary={readableReps}
          />
        )}

        {isCardio(kind) && (
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label={intervalMode ? "Total distance (km, optional)" : "Distance (km)"}>
              <input
                type="number"
                step="any"
                min="0"
                className="num w-full"
                placeholder={
                  intervalMode ? (repsKm > 0 ? `${parseFloat(repsKm.toFixed(2))} from reps` : "e.g. 8") : kind === "swim" ? "e.g. 1.5" : "e.g. 5"
                }
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
              />
            </Field>
            <div className="text-glass-3 pb-2 text-sm">
              {intervalMode ? (
                <span className="text-xs">Include your warm-up and cool-down, or leave blank to count the reps.</span>
              ) : pace ? (
                <>
                  Pace <span className="num text-glass">{pace}</span>
                </>
              ) : (
                "Add distance and duration to see your pace."
              )}
            </div>
          </div>
        )}

        {kind === "strength" && (
          <div className="space-y-3">
            <datalist id="exercise-names">
              {suggestions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            {blocks.map((b, bi) => (
              <div key={b.id} className="glass-nested rounded-xl p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    className="w-full"
                    list="exercise-names"
                    placeholder={bi === 0 ? "Exercise, e.g. Bench press" : "Exercise"}
                    aria-label={`Exercise ${bi + 1}`}
                    value={b.name}
                    onChange={(e) => updateBlock(b.id, (x) => ({ ...x, name: e.target.value }))}
                  />
                  {blocks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBlocks((bs) => bs.filter((x) => x.id !== b.id))}
                      className="text-glass-3 hover:text-[#ff6b8a] shrink-0 p-1"
                      aria-label={`Remove ${b.name || `exercise ${bi + 1}`}`}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {b.sets.map((s, si) => (
                    <div key={si} className="flex items-center gap-2 text-sm">
                      <span className="text-glass-3 num w-10 shrink-0 text-xs">Set {si + 1}</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className="num w-20"
                        placeholder="reps"
                        aria-label={`Set ${si + 1} reps`}
                        value={s.reps}
                        onChange={(e) =>
                          updateBlock(b.id, (x) => ({
                            ...x,
                            sets: x.sets.map((r, i) => (i === si ? { ...r, reps: e.target.value } : r)),
                          }))
                        }
                      />
                      <span className="text-glass-3">×</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        className="num w-24"
                        placeholder="kg"
                        aria-label={`Set ${si + 1} weight in kg`}
                        value={s.weight}
                        onChange={(e) =>
                          updateBlock(b.id, (x) => ({
                            ...x,
                            sets: x.sets.map((r, i) => (i === si ? { ...r, weight: e.target.value } : r)),
                          }))
                        }
                      />
                      <span className="text-glass-3 text-xs">kg</span>
                      {b.sets.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            updateBlock(b.id, (x) => ({ ...x, sets: x.sets.filter((_, i) => i !== si) }))
                          }
                          className="text-glass-3 hover:text-[#ff6b8a] ml-auto p-1"
                          aria-label={`Remove set ${si + 1}`}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    // A new set starts as a copy of the last — most sets repeat it.
                    onClick={() => updateBlock(b.id, (x) => ({ ...x, sets: [...x.sets, { ...x.sets[x.sets.length - 1] }] }))}
                    className="text-[color:var(--accent-soft)] text-xs hover:underline"
                  >
                    + Add set
                  </button>
                  {(() => {
                    const v = blockVolume(b);
                    if (v.reps === 0) return null;
                    return (
                      <span className="text-glass-3 num text-xs">
                        {v.volume > 0 ? (
                          <>
                            volume <span className="text-glass">{formatVolume(v.volume)}</span>
                          </>
                        ) : (
                          `${v.reps} reps`
                        )}
                      </span>
                    );
                  })()}
                </div>
              </div>
            ))}
            {(() => {
              const total = blocks.reduce((sum, b) => sum + blockVolume(b).volume, 0);
              return total > 0 ? (
                <p className="text-glass-3 num flex justify-between border-t border-white/10 pt-2 text-sm">
                  <span>Total volume</span>
                  <span className="text-glass font-medium">{formatVolume(total)}</span>
                </p>
              ) : null;
            })()}
            <Button type="button" className="inline-flex items-center gap-1.5" onClick={() => setBlocks((bs) => [...bs, emptyBlock()])}>
              <Plus size={13} strokeWidth={2} /> Add exercise
            </Button>
            <p className="text-glass-3 text-xs">Leave the weight blank for bodyweight moves like pull-ups.</p>
          </div>
        )}

        <Field label="Notes (optional)">
          <input className="w-full" placeholder="How did it feel?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {presetOpen && (
          <div className="glass-nested flex flex-wrap items-end gap-2 rounded-xl p-3">
            <Field label="Preset name">
              <input
                autoFocus
                className="w-48"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={presetKey}
              />
            </Field>
            <Button type="button" variant="primary" disabled={presetSaving} onClick={savePreset}>
              {presetSaving ? "Saving…" : matching ? "Update preset" : "Save preset"}
            </Button>
            <Button type="button" onClick={() => setPresetOpen(false)}>
              Cancel
            </Button>
            <p className="text-glass-3 w-full text-xs">
              {matching
                ? `Replaces your “${matching.name}” preset with what's in the form now.`
                : "Saves the type, name, duration and distance, and every exercise with its sets — ready to start from next time."}
            </p>
          </div>
        )}

        {error && <div className="text-sm text-[#ff6b8a]">{error}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          {!presetOpen ? (
            <Button type="button" variant="ghost" className="inline-flex items-center gap-1.5 px-0" onClick={openPresetPanel}>
              <BookmarkPlus size={14} strokeWidth={2} /> Save as preset
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : workout ? "Save" : "Log Workout"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** One small number box of the duration, with its unit beside it. */
export function DurationBox({
  label,
  unit,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1">
      <input
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        aria-label={label}
        className="num w-full min-w-0 px-2 text-center"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-glass-3 text-xs">{unit}</span>
    </span>
  );
}

/** The reps of an interval run: quick add, one row per rep, and the recovery between them. */
function IntervalsEditor({
  reps,
  setReps,
  recovery,
  setRecovery,
  quickCount,
  setQuickCount,
  quickDistance,
  setQuickDistance,
  summary,
}: {
  reps: RepRow[];
  setReps: (update: (rows: RepRow[]) => RepRow[]) => void;
  recovery: DurationParts;
  setRecovery: (update: (d: DurationParts) => DurationParts) => void;
  quickCount: string;
  setQuickCount: (v: string) => void;
  quickDistance: string;
  setQuickDistance: (v: string) => void;
  summary: IntervalRep[];
}) {
  const update = (id: number, change: Partial<RepRow>) =>
    setReps((rows) => rows.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const quickAdd = () => {
    const n = Math.min(50, Math.max(1, Math.floor(Number(quickCount)) || 0));
    if (!Number(quickCount)) return;
    const d = /^\d+$/.test(quickDistance.trim()) ? quickDistance.trim() : "";
    setReps((rows) => [...rows, ...Array.from({ length: n }, () => repRow(d))]);
  };
  // A new rep repeats the last one's distance — and its time too when the reps
  // are time-only efforts (8 × 2 min), where every rep is the same.
  const addRep = () =>
    setReps((rows) => {
      const last = rows[rows.length - 1];
      if (!last) return [repRow()];
      const timeOnly = last.distance.trim() === "";
      return [...rows, { ...repRow(last.distance), ...(timeOnly ? { m: last.m, s: last.s } : {}) }];
    });
  const stats = intervalStats(summary);
  const fastest = stats.fastest !== null ? summary[stats.fastest] : null;

  return (
    <div className="glass-nested space-y-3 rounded-xl p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-glass-3 text-xs uppercase tracking-wider">Quick add</span>
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          aria-label="Number of reps"
          className="num w-14 px-2 text-center"
          value={quickCount}
          onChange={(e) => setQuickCount(e.target.value)}
        />
        <span className="text-glass-3">×</span>
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          aria-label="Distance of each rep in metres"
          className="num w-20 px-2 text-center"
          placeholder="m"
          value={quickDistance}
          onChange={(e) => setQuickDistance(e.target.value)}
        />
        <span className="text-glass-3 text-xs">m</span>
        <Button type="button" className="ml-auto px-3 py-1.5 text-xs" onClick={quickAdd}>
          Add reps
        </Button>
      </div>

      {reps.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-glass-3 flex gap-2 pl-7 text-[10px] uppercase tracking-wider sm:pl-12">
            <span className="w-16 sm:w-20">Distance</span>
            <span>Time</span>
          </div>
          {reps.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span className="text-glass-3 num w-5 shrink-0 text-xs sm:w-10">
                <span className="hidden sm:inline">Rep </span>
                {i + 1}
              </span>
              <span className="flex w-16 shrink-0 items-center gap-1 sm:w-20">
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  aria-label={`Rep ${i + 1} distance in metres`}
                  className="num w-full min-w-0 px-2 text-center"
                  placeholder="m"
                  value={r.distance}
                  onChange={(e) => update(r.id, { distance: e.target.value })}
                />
              </span>
              <DurationBox label={`Rep ${i + 1} minutes`} unit="m" placeholder="0" value={r.m} onChange={(m) => update(r.id, { m })} />
              <DurationBox label={`Rep ${i + 1} seconds`} unit="s" placeholder="00" value={r.s} onChange={(v) => update(r.id, { s: v })} />
              <button
                type="button"
                onClick={() => setReps((rows) => rows.filter((x) => x.id !== r.id))}
                className="text-glass-3 hover:text-[#ff6b8a] shrink-0 p-1"
                aria-label={`Remove rep ${i + 1}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={addRep} className="text-[color:var(--accent-soft)] text-xs hover:underline">
          + Add rep
        </button>
        <span className="flex items-center gap-2 text-xs">
          <span className="text-glass-3">Recovery between reps</span>
          <span className="flex w-36 items-center gap-2">
            <DurationBox
              label="Recovery minutes"
              unit="m"
              placeholder="1"
              value={recovery.m}
              onChange={(m) => setRecovery((d) => ({ ...d, m }))}
            />
            <DurationBox
              label="Recovery seconds"
              unit="s"
              placeholder="30"
              value={recovery.s}
              onChange={(v) => setRecovery((d) => ({ ...d, s: v }))}
            />
          </span>
        </span>
      </div>

      {summary.length > 0 && (
        <p className="text-glass-3 border-t border-white/10 pt-2 text-xs">
          <span className="text-glass">{intervalStructure(summary)}</span>
          {stats.avgRepSec !== null && <> · avg <span className="num text-glass">{formatClock(stats.avgRepSec)}</span></>}
          {stats.avgPace !== null && <> · <span className="num text-glass">{formatPace("run", stats.avgPace)}</span></>}
          {fastest?.durationSec && (
            <>
              {" "}
              · fastest rep {stats.fastest! + 1} (<span className="num">{formatClock(fastest.durationSec)}</span>)
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** A hybrid session's runs and stations, in order — a Hyrox, or your own mix. */
function HybridEditor({
  rows,
  setRows,
  exerciseNames,
}: {
  rows: SegRow[];
  setRows: (update: (rows: SegRow[]) => SegRow[]) => void;
  exerciseNames: string[];
}) {
  const update = (id: number, change: Partial<SegRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const add = (type: "run" | "station") =>
    setRows((rs) => {
      // A new run repeats the last run's distance; a new station starts empty.
      const lastRun = [...rs].reverse().find((r) => r.type === "run");
      const row = segRow({ type });
      return [...rs, type === "run" && lastRun ? { ...row, distance: lastRun.distance } : row];
    });
  // The last run and the station after it, again — most sessions repeat the pattern.
  const lastPair = (() => {
    for (let i = rows.length - 1; i > 0; i--) {
      if (rows[i].type === "station" && rows[i - 1].type === "run") return [rows[i - 1], rows[i]];
    }
    return null;
  })();
  const repeatPair = () =>
    lastPair &&
    setRows((rs) => [
      ...rs,
      { ...lastPair[0], id: nextId++, m: "", s: "" },
      { ...lastPair[1], id: nextId++, m: "", s: "" },
    ]);
  const fillHyrox = () => {
    if (rows.some((r) => !segBlank(r)) && !confirm("Replace what you've entered with the Hyrox runs and stations?")) return;
    setRows(() => HYROX.map(segRow));
  };
  const names = [...new Set([...HYROX.flatMap((x) => (x.type === "station" ? [x.exercise] : [])), ...exerciseNames])];

  // What's been typed so far, read leniently for the running summary.
  const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const typed: HybridSegment[] = rows
    .filter((r) => !segBlank(r))
    .map((r) => {
      const sec = joinDuration({ h: "", m: r.m, s: r.s });
      const durationSec = sec !== null && !Number.isNaN(sec) ? sec : null;
      return r.type === "run"
        ? { type: "run", distanceM: num(r.distance), durationSec }
        : { type: "station", exercise: r.name, reps: num(r.reps), weightKg: num(r.weight), distanceM: num(r.distance), durationSec };
    });
  const h = hybridSummary(typed);

  let runNo = 0;
  return (
    <div className="glass-nested space-y-3 rounded-xl p-3">
      <datalist id="hybrid-stations">
        {names.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-glass-3 text-xs uppercase tracking-wider">Runs and stations, in order</span>
        <button type="button" onClick={fillHyrox} className="text-[color:var(--accent-soft)] text-xs hover:underline">
          Fill in a Hyrox
        </button>
      </div>

      <ol className="space-y-2">
        {rows.map((r) => {
          const n = r.type === "run" ? ++runNo : 0;
          const remove = (
            <button
              type="button"
              onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
              className="text-glass-3 hover:text-[#ff6b8a] shrink-0 p-1"
              aria-label={`Remove ${r.type === "run" ? `run ${n}` : r.name || "station"}`}
            >
              <X size={13} />
            </button>
          );
          return r.type === "run" ? (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-glass-3 inline-flex w-16 shrink-0 items-center gap-1 text-xs">
                <Footprints size={13} strokeWidth={1.75} className="text-[color:var(--accent-soft)]" /> Run {n}
              </span>
              <span className="flex w-24 shrink-0 items-center gap-1">
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  aria-label={`Run ${n} distance in metres`}
                  className="num w-full min-w-0 px-2 text-center"
                  // Not "1000": an example that looks filled in would leave runs without a distance.
                  placeholder="dist."
                  value={r.distance}
                  onChange={(e) => update(r.id, { distance: e.target.value })}
                />
                <span className="text-glass-3 text-xs">m</span>
              </span>
              {/* On a narrow screen the time wraps onto its own line rather than squashing. */}
              <span className="flex min-w-[10rem] flex-1 items-center gap-2">
                <span className="text-glass-3 shrink-0 text-xs">time</span>
                <DurationBox label={`Run ${n} minutes`} unit="m" placeholder="0" value={r.m} onChange={(m) => update(r.id, { m })} />
                <DurationBox label={`Run ${n} seconds`} unit="s" placeholder="00" value={r.s} onChange={(v) => update(r.id, { s: v })} />
                {remove}
              </span>
            </li>
          ) : (
            <li key={r.id} className="rounded-lg border border-white/10 p-2 text-sm">
              <div className="flex items-center gap-2">
                <Dumbbell size={13} strokeWidth={1.75} className="text-glass-3 shrink-0" />
                <input
                  className="w-full min-w-0"
                  list="hybrid-stations"
                  placeholder="Station, e.g. Wall Balls"
                  aria-label="Station"
                  value={r.name}
                  onChange={(e) => update(r.id, { name: e.target.value })}
                />
                {remove}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 pl-5">
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    aria-label={`${r.name || "Station"} reps`}
                    className="num w-16 px-2 text-center"
                    placeholder="reps"
                    value={r.reps}
                    onChange={(e) => update(r.id, { reps: e.target.value })}
                  />
                  <span className="text-glass-3">×</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    aria-label={`${r.name || "Station"} weight in kg`}
                    className="num w-16 px-2 text-center"
                    placeholder="kg"
                    value={r.weight}
                    onChange={(e) => update(r.id, { weight: e.target.value })}
                  />
                </span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    aria-label={`${r.name || "Station"} distance in metres`}
                    className="num w-20 px-2 text-center"
                    placeholder="m"
                    value={r.distance}
                    onChange={(e) => update(r.id, { distance: e.target.value })}
                  />
                  <span className="text-glass-3 text-xs">m</span>
                </span>
                <span className="flex w-40 items-center gap-2">
                  <span className="text-glass-3 text-xs">time</span>
                  <DurationBox label={`${r.name || "Station"} minutes`} unit="m" placeholder="0" value={r.m} onChange={(m) => update(r.id, { m })} />
                  <DurationBox label={`${r.name || "Station"} seconds`} unit="s" placeholder="00" value={r.s} onChange={(v) => update(r.id, { s: v })} />
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <button type="button" onClick={() => add("run")} className="text-[color:var(--accent-soft)] hover:underline">
          + Run
        </button>
        <button type="button" onClick={() => add("station")} className="text-[color:var(--accent-soft)] hover:underline">
          + Station
        </button>
        {lastPair && (
          <button type="button" onClick={repeatPair} className="text-[color:var(--accent-soft)] hover:underline">
            + Repeat the last run and station
          </button>
        )}
      </div>

      {(h.runs > 0 || h.stations > 0) && (
        <p className="text-glass-3 border-t border-white/10 pt-2 text-xs">
          {h.runs > 0 && (
            <>
              <span className="text-glass">
                {h.runs} run{h.runs === 1 ? "" : "s"}
              </span>
              {h.runKm > 0 && ` · ${parseFloat(h.runKm.toFixed(2))} km`}
              {h.runPace !== null && (
                <>
                  {" "}
                  · avg <span className="num text-glass">{formatPace("run", h.runPace)}</span>
                </>
              )}
            </>
          )}
          {h.runs > 0 && h.stations > 0 && " · "}
          {h.stations > 0 && (
            <span className="text-glass">
              {h.stations} station{h.stations === 1 ? "" : "s"}
            </span>
          )}
          {h.volume > 0 && ` · ${formatVolume(h.volume)} volume`}
          {h.splitsSec !== null && (
            <>
              {" "}
              · splits add up to <span className="num text-glass">{formatClock(h.splitsSec)}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}
