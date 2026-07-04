import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Check, Plus } from "lucide-react";
import { api } from "../api/client";
import type { Account, Goal } from "../types";
import { Button, Field, Modal, StatTile, Tile } from "../components/ui";
import { formatDate } from "../lib/format";
import { useCurrency } from "../lib/CurrencyContext";

export default function Goals() {
  const { format } = useCurrency();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [editing, setEditing] = useState<Goal | "new" | null>(null);

  const refresh = () => api.listGoals().then(setGoals);

  useEffect(() => {
    refresh();
    api.listAccounts().then(setAccounts);
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Delete this goal?")) return;
    await api.deleteGoal(id);
    refresh();
  };

  const totalTarget = goals.reduce((s, g) => s + g.targetAmount, 0);
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const reached = goals.filter((g) => g.progress >= 1).length;

  return (
    <div className="space-y-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">Goals</h1>
          <p className="text-glass-3 mt-1 text-[13px]">Savings targets and progress</p>
        </div>
        <Button variant="primary" className="inline-flex items-center gap-1.5" onClick={() => setEditing("new")}>
          <Plus size={14} strokeWidth={2} /> Add Goal
        </Button>
      </header>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-4">
        <StatTile label="Total Saved" value={format(totalSaved)} tone="income" />
        <StatTile label="Total Target" value={format(totalTarget)} tone="accent" />
        <StatTile label="Goals Reached" value={`${reached} / ${goals.length}`} tone="default" />
      </div>

      {goals.length === 0 ? (
        <Tile className="p-10 text-center text-sm text-glass-3">
          No goals yet. Add one to start tracking a savings target.
        </Tile>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              format={format}
              onEdit={() => setEditing(g)}
              onRemove={() => remove(g.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <GoalForm
          goal={editing === "new" ? null : editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function GoalCard({
  goal,
  format,
  onEdit,
  onRemove,
}: {
  goal: Goal;
  format: (v: number) => string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const pct = Math.min(goal.progress * 100, 100);
  const done = goal.progress >= 1;

  return (
    <Tile className="p-[22px]">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-glass text-[15px] font-semibold">{goal.name}</div>
          <div className="text-glass-3 mt-0.5 text-xs">
            {goal.accountName ? `Linked to ${goal.accountName}` : "Manual tracking"}
            {goal.targetDate && ` · by ${formatDate(goal.targetDate)}`}
          </div>
        </div>
        <div className="flex gap-2 text-xs">
          <button className="text-balance hover:underline" onClick={onEdit}>
            edit
          </button>
          <button className="text-expense hover:underline" onClick={onRemove}>
            remove
          </button>
        </div>
      </div>

      <div className="num mt-4 flex items-baseline justify-between">
        <span className="text-[22px] font-semibold tracking-tight text-glass">
          {format(goal.saved)}
        </span>
        <span className="text-glass-3 text-sm">of {format(goal.targetAmount)}</span>
      </div>

      <div className="glass-nested mt-2 h-2.5 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full ${done ? "bg-income" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="num mt-1 flex justify-between text-xs text-glass-3">
        {done ? (
          <span className="text-income inline-flex items-center gap-1">
            <Check size={12} strokeWidth={2.5} /> Reached
          </span>
        ) : (
          <span>{pct.toFixed(0)}%</span>
        )}
        <span>{done ? "" : `${format(goal.remaining)} to go`}</span>
      </div>
    </Tile>
  );
}

function GoalForm({
  goal,
  accounts,
  onClose,
  onSaved,
}: {
  goal: Goal | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(goal?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmount) : "");
  const [accountId, setAccountId] = useState(goal?.accountId ?? "");
  const [savedAmount, setSavedAmount] = useState(goal ? String(goal.savedAmount) : "0");
  const [targetDate, setTargetDate] = useState(goal?.targetDate?.slice(0, 10) ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Name is required.");
    const target = Number(targetAmount);
    if (!Number.isFinite(target) || target <= 0) return setError("Enter a positive target.");

    const payload = {
      name: name.trim(),
      targetAmount: target,
      accountId: accountId || null,
      savedAmount: accountId ? 0 : Number(savedAmount) || 0,
      targetDate: targetDate ? new Date(targetDate).toISOString() : null,
    };
    setSaving(true);
    try {
      if (goal) await api.updateGoal(goal.id, payload);
      else await api.createGoal(payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal title={goal ? "Edit Goal" : "Add Goal"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name">
          <input
            className="w-full"
            placeholder="e.g. Emergency Fund"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount">
            <input
              type="number"
              step="0.01"
              min="0"
              className="num w-full"
              value={targetAmount}
              onChange={(e) => setTargetAmount(e.target.value)}
            />
          </Field>
          <Field label="Target date (optional)">
            <input
              type="date"
              className="w-full"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Track progress from">
          <select className="w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Manual amount</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} (use balance)
              </option>
            ))}
          </select>
        </Field>
        {!accountId && (
          <Field label="Saved so far">
            <input
              type="number"
              step="0.01"
              min="0"
              className="num w-full"
              value={savedAmount}
              onChange={(e) => setSavedAmount(e.target.value)}
            />
          </Field>
        )}

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
