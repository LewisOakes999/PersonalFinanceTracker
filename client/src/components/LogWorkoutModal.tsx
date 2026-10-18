import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { api } from "../api/client";
import type { Workout, WorkoutKind } from "../types";
import { Button, Field, Modal } from "./ui";
import { KINDS, durationInput, isCardio, kindInfo, paceLabel, parseDuration } from "../lib/fitness";
import { KIND_ICONS } from "../lib/fitnessIcons";

type SetRow = { reps: string; weight: string };
type ExerciseBlock = { id: number; name: string; sets: SetRow[] };

let nextId = 1;
const emptyBlock = (): ExerciseBlock => ({ id: nextId++, name: "", sets: [{ reps: "", weight: "" }] });

/** Stored sets back into one block per exercise, keeping their order. */
function toBlocks(w: Workout | null): ExerciseBlock[] {
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
  onClose,
  onSaved,
}: {
  workout: Workout | null;
  exerciseNames: string[];
  onClose: () => void;
  onSaved: (saved: Workout) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<WorkoutKind>(workout?.kind ?? "strength");
  const [date, setDate] = useState(workout ? workout.date.slice(0, 10) : today);
  const [time, setTime] = useState(durationInput(workout?.durationSec ?? null));
  const [title, setTitle] = useState(workout?.title ?? "");
  const [distance, setDistance] = useState(workout?.distanceKm ? String(workout.distanceKm) : "");
  const [notes, setNotes] = useState(workout?.notes ?? "");
  const [blocks, setBlocks] = useState<ExerciseBlock[]>(() => toBlocks(workout));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const info = kindInfo(kind);
  const seconds = parseDuration(time);
  const km = distance.trim() === "" ? null : Number(distance);
  const pace = isCardio(kind) ? paceLabel(kind, km, seconds !== null && !Number.isNaN(seconds) ? seconds : null) : null;

  const updateBlock = (id: number, change: (b: ExerciseBlock) => ExerciseBlock) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? change(b) : b)));

  // Exercise suggestions: everything logged before, plus names typed in this form.
  const suggestions = useMemo(
    () => [...new Set([...exerciseNames, ...blocks.map((b) => b.name.trim()).filter(Boolean)])],
    [exerciseNames, blocks]
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!date) return setError("Pick a date.");
    if (date > today) return setError("A workout can't be dated in the future.");
    if (seconds !== null && Number.isNaN(seconds))
      return setError("Enter the time as minutes (45) or m:ss (25:30).");

    // A name matching an earlier exercise (in any case) takes its existing
    // spelling, so "bench press" doesn't rename "Bench press" everywhere.
    const known = new Map(exerciseNames.map((n) => [n.trim().toLowerCase(), n]));
    const canonical = (name: string) => known.get(name.trim().toLowerCase()) ?? name.trim();

    let sets: { exercise: string; reps: number; weightKg: number }[] = [];
    if (kind === "strength") {
      for (const b of blocks) {
        const filled = b.sets.filter((s) => s.reps.trim() !== "" || s.weight.trim() !== "");
        if (!b.name.trim() && filled.length === 0) continue; // an untouched block
        if (!b.name.trim()) return setError("Give every exercise a name.");
        for (const s of filled) {
          const reps = Number(s.reps);
          const weightKg = s.weight.trim() === "" ? 0 : Number(s.weight);
          if (!Number.isInteger(reps) || reps < 1)
            return setError(`Enter the reps for each set of ${b.name.trim()}.`);
          if (!Number.isFinite(weightKg) || weightKg < 0)
            return setError(`Check the weights for ${b.name.trim()}.`);
          sets.push({ exercise: canonical(b.name), reps, weightKg });
        }
      }
      if (sets.length === 0) return setError("Add at least one exercise with a set.");
    } else {
      sets = [];
    }
    if (isCardio(kind) && km !== null && (!Number.isFinite(km) || km <= 0))
      return setError("Enter the distance in km.");

    const payload = {
      date: new Date(date).toISOString(),
      kind,
      title: title.trim(),
      durationSec: seconds,
      distanceKm: isCardio(kind) ? km : null,
      notes: notes.trim() || null,
      sets,
    };
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

  return (
    <Modal title={workout ? "Edit Workout" : "Log Workout"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Kind of workout">
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
                    ? "border-[rgba(10,132,255,0.6)] bg-[rgba(10,132,255,0.18)] text-white"
                    : "border-white/10 bg-white/5 text-glass-3 hover:text-glass"
                }`}
              >
                <Icon size={16} strokeWidth={1.75} />
                {k.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className="w-full" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {/* Either format works in both: minutes ("45") or a clock time ("25:30"). */}
          <Field label={info.group === "cardio" ? "Time (optional)" : "Minutes (optional)"}>
            <input
              className="num w-full"
              placeholder={info.group === "cardio" ? "e.g. 25:30" : "e.g. 45"}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Name (optional)">
          <input className="w-full" placeholder={info.placeholder} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        {isCardio(kind) && (
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Distance (km)">
              <input
                type="number"
                step="any"
                min="0"
                className="num w-full"
                placeholder={kind === "swim" ? "e.g. 1.5" : "e.g. 5"}
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
              />
            </Field>
            <div className="text-glass-3 pb-2 text-sm">
              {pace ? (
                <>
                  Pace <span className="num text-glass">{pace}</span>
                </>
              ) : (
                "Add distance and time to see your pace."
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
                <button
                  type="button"
                  // A new set starts as a copy of the last — most sets repeat it.
                  onClick={() => updateBlock(b.id, (x) => ({ ...x, sets: [...x.sets, { ...x.sets[x.sets.length - 1] }] }))}
                  className="text-[#64d2ff] mt-2 text-xs hover:underline"
                >
                  + Add set
                </button>
              </div>
            ))}
            <Button type="button" className="inline-flex items-center gap-1.5" onClick={() => setBlocks((bs) => [...bs, emptyBlock()])}>
              <Plus size={13} strokeWidth={2} /> Add exercise
            </Button>
            <p className="text-glass-3 text-xs">Leave the weight blank for bodyweight moves like pull-ups.</p>
          </div>
        )}

        <Field label="Notes (optional)">
          <input className="w-full" placeholder="How did it feel?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {error && <div className="text-sm text-[#ff6b8a]">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "Saving…" : workout ? "Save" : "Log Workout"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
