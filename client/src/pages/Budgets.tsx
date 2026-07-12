import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api/client";
import type { Budget, Category } from "../types";
import { Button, Field, MonthSelector, SectionTitle, Tile } from "../components/ui";
import { currentMonth } from "../lib/format";
import { useCurrency } from "../lib/CurrencyContext";
import { toast } from "../lib/toast";

const EXPENSE = "#ff6b8a";
const INCOME = "#34e0c4";

export default function Budgets() {
  const { format } = useCurrency();
  const [month, setMonth] = useState(currentMonth());
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCat, setNewCat] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const refresh = () => api.listBudgets(month).then(setBudgets);

  useEffect(() => {
    refresh();
  }, [month]);

  useEffect(() => {
    api.listCategories().then((c) => setCategories(c.filter((x) => x.type === "expense")));
  }, []);

  const unbudgeted = categories.filter((c) => !budgets.some((b) => b.categoryId === c.id));

  const addBudget = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(newAmount);
    if (!newCat || !Number.isFinite(amount) || amount <= 0) return;
    await api.upsertBudget({ categoryId: newCat, month, amount });
    toast.success("Budget set.");
    setNewCat("");
    setNewAmount("");
    refresh();
  };

  const updateAmount = async (b: Budget, amount: number) => {
    await api.upsertBudget({ categoryId: b.categoryId, month, amount });
    toast.success("Budget updated.");
    refresh();
  };

  const remove = async (id: string) => {
    await api.deleteBudget(id);
    toast.success("Budget removed.");
    refresh();
  };

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
  const remaining = totalBudget - totalSpent;

  return (
    <div className="space-y-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">Budgets</h1>
          <p className="text-glass-3 mt-1 text-[13px]">Track spending against monthly limits</p>
        </div>
        <MonthSelector value={month} onChange={setMonth} />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile rounded="rounded-glass" className="p-5">
          <div className="text-glass-3 text-xs uppercase tracking-[0.08em]">Total Budgeted</div>
          <div className="num mt-3 text-[26px] font-semibold tracking-tight text-glass">
            {format(totalBudget)}
          </div>
        </Tile>
        <Tile rounded="rounded-glass" className="p-5">
          <div className="text-glass-3 text-xs uppercase tracking-[0.08em]">Total Spent</div>
          <div className="num mt-3 text-[26px] font-semibold tracking-tight" style={{ color: EXPENSE }}>
            {format(totalSpent)}
          </div>
        </Tile>
        <Tile rounded="rounded-glass" className="p-5">
          <div className="text-glass-3 text-xs uppercase tracking-[0.08em]">Remaining</div>
          <div
            className="num mt-3 text-[26px] font-semibold tracking-tight"
            style={{ color: remaining >= 0 ? INCOME : EXPENSE }}
          >
            {format(remaining)}
          </div>
        </Tile>
      </div>

      <Tile className="p-[22px]">
        <SectionTitle>Budget Progress</SectionTitle>
        {budgets.length === 0 ? (
          <div className="text-glass-3 py-8 text-center text-sm">
            No budgets for this month yet. Use the form below — pick a category, set a monthly
            limit, and your spending will be tracked against it here.
          </div>
        ) : (
          <div className="space-y-5">
            {budgets.map((b) => (
              <BudgetRow
                key={b.id}
                budget={b}
                format={format}
                onUpdate={(amount) => updateAmount(b, amount)}
                onRemove={() => remove(b.id)}
              />
            ))}
          </div>
        )}
      </Tile>

      {/* Add budget */}
      <Tile className="p-[22px]">
        <SectionTitle>Add / Update Budget</SectionTitle>
        <form onSubmit={addBudget} data-tour="add-budget" className="flex flex-wrap items-end gap-3">
          <Field label="Category">
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)}>
              <option value="">Select…</option>
              {unbudgeted.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Monthly amount">
            <input
              type="number"
              min="0"
              step="0.01"
              className="num"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary">
            Set Budget
          </Button>
          {unbudgeted.length === 0 && (
            <span className="text-glass-3 text-xs">All expense categories are budgeted.</span>
          )}
        </form>
      </Tile>
    </div>
  );
}

function BudgetRow({
  budget,
  format,
  onUpdate,
  onRemove,
}: {
  budget: Budget;
  format: (v: number) => string;
  onUpdate: (amount: number) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(String(budget.amount));

  const pct = budget.amount > 0 ? (budget.spent / budget.amount) * 100 : 0;
  const over = budget.spent > budget.amount;
  const fill = over ? "bg-expense" : pct > 80 ? "bg-warn" : "bg-accent";

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-glass">
          <span
            className="inline-block h-[10px] w-[10px] rounded-[3px]"
            style={{ background: budget.category.color }}
          />
          {budget.category.name}
        </span>
        <span className="num text-glass-3">
          <span style={over ? { color: "#ff6b8a" } : { color: "var(--lg-text)" }}>
            {format(budget.spent)}
          </span>{" "}
          / {format(budget.amount)}
          {!editing && (
            <button
              className="ml-3 text-xs text-[#64d2ff] hover:underline"
              onClick={() => setEditing(true)}
            >
              edit
            </button>
          )}
          <button
            className="ml-2 text-xs text-[#ff9bae] hover:underline"
            onClick={onRemove}
          >
            remove
          </button>
        </span>
      </div>

      {/* Rounded progress bar */}
      <div className="glass-nested h-2.5 w-full overflow-hidden rounded-full">
        <div
          className={`h-full rounded-full transition-[width] ${fill}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="num text-glass-3 mt-1 text-xs">
        {pct.toFixed(0)}% used
        {over && (
          <span className="ml-2" style={{ color: "#ff6b8a" }}>
            over by {format(budget.spent - budget.amount)}
          </span>
        )}
      </div>

      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            className="num w-32"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button
            variant="primary"
            onClick={() => {
              onUpdate(Number(amount));
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}
