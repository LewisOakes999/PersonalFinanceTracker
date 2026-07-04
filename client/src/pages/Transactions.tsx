import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, ChevronUp, Plus, Repeat, Split, X } from "lucide-react";
import { api } from "../api/client";
import type {
  Account,
  Attachment,
  Category,
  RecurFrequency,
  Recurring,
  RecurringTransfer,
  Transaction,
  Transfer,
  TxnType,
} from "../types";
import { Button, Field, Modal, Tile } from "../components/ui";
import { PeriodSelector } from "../components/PeriodSelector";
import { defaultPeriod, periodParams, type Period } from "../lib/period";
import { formatDate } from "../lib/format";
import { useCurrency } from "../lib/CurrencyContext";
import { toast } from "../lib/toast";

type SortField = "date" | "amount" | "description";
type TypeFilter = "" | TxnType | "transfer";
type FeedRow = { kind: "txn"; t: Transaction } | { kind: "xfer"; t: Transfer };

const SKY = "#64d2ff";

function matchesTransfer(tr: Transfer, query: string): boolean {
  const q = query.toLowerCase();
  return (
    "transfer".includes(q) ||
    (tr.note ?? "").toLowerCase().includes(q) ||
    tr.fromAccount.name.toLowerCase().includes(q) ||
    tr.toAccount.name.toLowerCase().includes(q)
  );
}

export default function Transactions() {
  const { format } = useCurrency();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [period, setPeriod] = useState<Period>(() => defaultPeriod("all"));
  const [sort, setSort] = useState<SortField>("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<Transfer | "new" | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);

  const refresh = () => {
    const pp = periodParams(period);
    const params: Record<string, string> = { sort, order, ...pp };
    if (search) params.search = search;
    if (typeFilter === "income" || typeFilter === "expense") params.type = typeFilter;
    if (categoryFilter) params.categoryId = categoryFilter;
    api.listTransactions(params).then(setTransactions);
    api.listTransfers(pp).then(setTransfers);
  };

  useEffect(() => {
    api.listCategories().then(setCategories);
    api.listAccounts().then(setAccounts);
  }, []);

  useEffect(refresh, [search, typeFilter, categoryFilter, period, sort, order]);

  // Merge transactions + transfers into one sorted feed.
  const feed = useMemo<FeedRow[]>(() => {
    const showXfers = !categoryFilter && (typeFilter === "" || typeFilter === "transfer");
    const showTxns = typeFilter !== "transfer";
    const rows: FeedRow[] = [];
    if (showTxns) for (const t of transactions) rows.push({ kind: "txn", t });
    if (showXfers) {
      const list = search ? transfers.filter((tr) => matchesTransfer(tr, search)) : transfers;
      for (const t of list) rows.push({ kind: "xfer", t });
    }
    const valueOf = (r: FeedRow): string | number => {
      if (sort === "amount") return r.t.amount;
      if (sort === "description") {
        return r.kind === "txn"
          ? (r.t.description || r.t.category.name).toLowerCase()
          : `transfer ${r.t.note ?? ""}`.toLowerCase();
      }
      return r.t.date;
    };
    rows.sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return order === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [transactions, transfers, typeFilter, categoryFilter, search, sort, order]);

  const toggleSort = (field: SortField) => {
    if (sort === field) setOrder(order === "asc" ? "desc" : "asc");
    else {
      setSort(field);
      setOrder(field === "date" ? "desc" : "asc");
    }
  };

  const sortArrow = (field: SortField) =>
    sort === field ? (
      order === "asc" ? (
        <ChevronUp size={12} className="ml-0.5 inline align-[-1px]" />
      ) : (
        <ChevronDown size={12} className="ml-0.5 inline align-[-1px]" />
      )
    ) : null;

  const onDeleteTxn = async (id: string) => {
    if (!confirm("Delete this transaction?")) return;
    await api.deleteTransaction(id);
    refresh();
  };
  const onDeleteTransfer = async (id: string) => {
    if (!confirm("Delete this transfer?")) return;
    await api.deleteTransfer(id);
    refresh();
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">Transactions</h1>
          <p className="text-glass-3 mt-1 text-[13px]">Search, filter, add, transfer and import</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowImport(true)}>Import CSV</Button>
          <Button onClick={() => api.exportCsv().catch((e) => toast.error((e as Error).message))}>
            Export CSV
          </Button>
          <Button className="inline-flex items-center gap-1.5" onClick={() => setShowRecurring(true)}>
            <Repeat size={13} strokeWidth={2} /> Recurring
          </Button>
          <Button className="inline-flex items-center gap-1.5" onClick={() => setEditingTransfer("new")}>
            <ArrowLeftRight size={13} strokeWidth={2} /> Transfer
          </Button>
          <Button
            variant="primary"
            className="inline-flex items-center gap-1.5"
            data-tour="add-transaction"
            onClick={() => setEditing("new")}
          >
            <Plus size={14} strokeWidth={2} /> Add Transaction
          </Button>
        </div>
      </header>

      {/* Filters */}
      <Tile className="flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[14rem]">
          <Field label="Search">
            <input
              className="w-full"
              placeholder="Description, note, category or transfer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Type">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
            <option value="">All</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfers</option>
          </select>
        </Field>
        <Field label="Category">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Period">
          <PeriodSelector value={period} onChange={setPeriod} allowAll />
        </Field>
      </Tile>

      {/* Table */}
      <Tile className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-glass-3">
              <Th onClick={() => toggleSort("date")}>Date{sortArrow("date")}</Th>
              <Th onClick={() => toggleSort("description")}>Description{sortArrow("description")}</Th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Account</th>
              <Th onClick={() => toggleSort("amount")} className="text-right">
                Amount{sortArrow("amount")}
              </Th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {feed.map((row) =>
              row.kind === "txn" ? (
                <tr key={`t-${row.t.id}`} className="border-b border-white/10 hover:bg-white/5">
                  <td className="num whitespace-nowrap px-4 py-2 text-glass-3">
                    {formatDate(row.t.date)}
                  </td>
                  <td className="px-4 py-2 text-glass">
                    {row.t.recurringId && (
                      <span className="text-balance mr-1 inline-block align-[-2px]" title="From a recurring rule">
                        <Repeat size={12} strokeWidth={2} />
                      </span>
                    )}
                    {row.t.description || <span className="text-glass-3">—</span>}
                    {row.t.note && <span className="ml-2 text-xs text-glass-3">({row.t.note})</span>}
                  </td>
                  <td className="px-4 py-2">
                    {row.t.splits.length > 0 ? (
                      <span
                        className="text-glass"
                        title={row.t.splits
                          .map((s) => `${s.category.name}: ${s.amount}`)
                          .join(", ")}
                      >
                        <span className="text-balance mr-1 inline-block align-[-2px]">
                          <Split size={12} strokeWidth={2} />
                        </span>
                        Split · {row.t.splits.length} categories
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-glass">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-[3px]"
                          style={{ backgroundColor: row.t.category.color }}
                        />
                        {row.t.category.name}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-glass-3">{row.t.account.name}</td>
                  <td
                    className={`num px-4 py-2 text-right ${
                      row.t.type === "income" ? "text-[#34e0c4]" : "text-[#ff6b8a]"
                    }`}
                  >
                    {row.t.type === "income" ? "+" : "−"}
                    {format(row.t.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="text-xs text-[#64d2ff] hover:underline"
                      onClick={() => setEditing(row.t)}
                    >
                      Edit
                    </button>
                    <button
                      className="ml-3 text-xs text-[#ff6b8a] hover:underline"
                      onClick={() => onDeleteTxn(row.t.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={`x-${row.t.id}`} className="border-b border-white/10 hover:bg-white/5">
                  <td className="num whitespace-nowrap px-4 py-2 text-glass-3">
                    {formatDate(row.t.date)}
                  </td>
                  <td className="px-4 py-2 text-glass">
                    <span className="inline-flex items-center gap-2">
                      <ArrowLeftRight size={13} strokeWidth={2} style={{ color: SKY }} /> Transfer
                    </span>
                    {row.t.note && <span className="ml-2 text-xs text-glass-3">({row.t.note})</span>}
                  </td>
                  <td className="px-4 py-2 text-glass-3">—</td>
                  <td className="px-4 py-2 text-glass-3">
                    {row.t.fromAccount.name} <span className="text-glass-3">→</span>{" "}
                    {row.t.toAccount.name}
                  </td>
                  <td className="num px-4 py-2 text-right" style={{ color: SKY }}>
                    {format(row.t.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <button
                      className="text-xs text-[#64d2ff] hover:underline"
                      onClick={() => setEditingTransfer(row.t)}
                    >
                      Edit
                    </button>
                    <button
                      className="ml-3 text-xs text-[#ff6b8a] hover:underline"
                      onClick={() => onDeleteTransfer(row.t.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              )
            )}
            {feed.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-glass-3">
                  Nothing matches.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Tile>

      <div className="num text-xs text-glass-3">
        {transactions.length} transactions · {transfers.length} transfers
      </div>

      {editing && (
        <TransactionForm
          transaction={editing === "new" ? null : editing}
          categories={categories}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {editingTransfer && (
        <TransferForm
          transfer={editingTransfer === "new" ? null : editingTransfer}
          accounts={accounts}
          onClose={() => setEditingTransfer(null)}
          onSaved={() => {
            setEditingTransfer(null);
            refresh();
          }}
        />
      )}

      {showImport && (
        <ImportModal
          accounts={accounts}
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            api.listCategories().then(setCategories);
            refresh();
          }}
        />
      )}

      {showRecurring && (
        <RecurringManager
          categories={categories}
          accounts={accounts}
          onClose={() => setShowRecurring(false)}
          onChange={refresh}
        />
      )}
    </div>
  );
}

function Th({
  children,
  onClick,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none px-4 py-3 hover:text-glass ${className}`}
    >
      {children}
    </th>
  );
}

function AttachmentsSection({ transactionId }: { transactionId: string }) {
  const [items, setItems] = useState<Attachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.listAttachments(transactionId).then(setItems);
  useEffect(() => {
    load();
  }, [transactionId]);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await api.uploadAttachment(transactionId, file);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <span className="text-glass-3 mb-1 block text-xs uppercase tracking-wider">Receipts</span>
      <div className="glass-nested space-y-2 rounded-xl p-3">
        {items.length === 0 && <p className="text-glass-3 text-xs">No receipts attached.</p>}
        {items.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
            <button
              type="button"
              className="truncate text-left text-[#64d2ff] hover:underline"
              onClick={() => api.openAttachment(a.id).catch((e) => toast.error((e as Error).message))}
            >
              {a.filename}
            </button>
            <span className="flex shrink-0 items-center gap-3">
              <span className="num text-glass-3 text-xs">{(a.size / 1024).toFixed(0)} KB</span>
              <button
                type="button"
                className="text-xs text-[#ff9bae] hover:underline"
                onClick={async () => {
                  await api.deleteAttachment(a.id);
                  load();
                }}
              >
                remove
              </button>
            </span>
          </div>
        ))}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf"
          onChange={onFile}
        />
        <button
          type="button"
          disabled={busy}
          className="text-xs text-[#64d2ff] hover:underline disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
        >
          {busy ? "Uploading…" : "+ Attach receipt"}
        </button>
      </div>
    </div>
  );
}

function TransactionForm({
  transaction,
  categories,
  accounts,
  onClose,
  onSaved,
}: {
  transaction: Transaction | null;
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<TxnType>(transaction?.type ?? "expense");
  const [date, setDate] = useState(
    transaction?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? "");
  const [accountId, setAccountId] = useState(transaction?.accountId ?? accounts[0]?.id ?? "");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [note, setNote] = useState(transaction?.note ?? "");
  const [splitMode, setSplitMode] = useState((transaction?.splits?.length ?? 0) > 0);
  const [splits, setSplits] = useState<{ categoryId: string; amount: string }[]>(
    transaction?.splits?.length
      ? transaction.splits.map((s) => ({ categoryId: s.categoryId, amount: String(s.amount) }))
      : [{ categoryId: "", amount: "" }]
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const visibleCategories = categories.filter((c) => c.type === type);
  const setSplit = (i: number, patch: Partial<{ categoryId: string; amount: string }>) =>
    setSplits(splits.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const splitSum = splits.reduce((a, s) => a + (Number(s.amount) || 0), 0);

  // Keep category valid when switching type.
  useEffect(() => {
    if (!visibleCategories.some((c) => c.id === categoryId)) {
      setCategoryId(visibleCategories[0]?.id ?? "");
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a positive amount.");
    if (!accountId) return setError("Pick an account.");

    const base = {
      date: new Date(date).toISOString(),
      amount: value,
      type,
      accountId,
      description,
      note: note || null,
    };

    let payload: Record<string, unknown>;
    if (splitMode) {
      const lines = splits
        .filter((s) => s.categoryId && Number(s.amount) > 0)
        .map((s) => ({ categoryId: s.categoryId, amount: Number(s.amount) }));
      if (lines.length === 0) return setError("Add at least one split line.");
      if (Math.abs(splitSum - value) > 0.01)
        return setError(`Splits add up to ${splitSum.toFixed(2)}, but the total is ${value.toFixed(2)}.`);
      payload = { ...base, categoryId: lines[0].categoryId, splits: lines };
    } else {
      if (!categoryId) return setError("Pick a category.");
      payload = { ...base, categoryId, splits: [] };
    }
    setSaving(true);
    try {
      if (transaction) await api.updateTransaction(transaction.id, payload);
      else await api.createTransaction(payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal title={transaction ? "Edit Transaction" : "Add Transaction"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          {(["expense", "income"] as TxnType[]).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
              className={`flex-1 border px-3 py-2 text-sm capitalize transition-colors ${
                type === t
                  ? t === "income"
                    ? "border-[#34e0c4] bg-[#34e0c4]/10 text-[#34e0c4]"
                    : "border-[#ff6b8a] bg-[#ff6b8a]/10 text-[#ff9bae]"
                  : "border-white/10 bg-white/5 text-glass-3"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input type="date" className="w-full" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Amount">
            <input
              type="number"
              step="0.01"
              min="0"
              className="num w-full"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!splitMode && (
            <Field label="Category">
              <select className="w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">Select…</option>
                {visibleCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Account">
            <select className="w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-glass">
          <input type="checkbox" checked={splitMode} onChange={(e) => setSplitMode(e.target.checked)} />
          Split across categories
        </label>

        {splitMode && (
          <div className="glass-nested space-y-2 rounded-xl p-3">
            <div className="flex justify-between text-xs text-glass-3">
              <span>Line items</span>
              <span className="num" style={{ color: Math.abs(splitSum - Number(amount)) < 0.01 ? "#34e0c4" : "#ff9bae" }}>
                {splitSum.toFixed(2)} / {(Number(amount) || 0).toFixed(2)}
              </span>
            </div>
            {splits.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className="w-full"
                  value={s.categoryId}
                  onChange={(e) => setSplit(i, { categoryId: e.target.value })}
                >
                  <option value="">Category…</option>
                  {visibleCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="num w-28"
                  value={s.amount}
                  onChange={(e) => setSplit(i, { amount: e.target.value })}
                />
                {splits.length > 1 && (
                  <button
                    type="button"
                    className="text-[#ff9bae] hover:text-[#ff6b8a]"
                    onClick={() => setSplits(splits.filter((_, j) => j !== i))}
                    aria-label="Remove line"
                  >
                    <X size={14} strokeWidth={2} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="text-xs text-[#64d2ff] hover:underline"
              onClick={() => setSplits([...splits, { categoryId: "", amount: "" }])}
            >
              + Add line
            </button>
          </div>
        )}

        <Field label="Description">
          <input className="w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Note (optional)">
          <input className="w-full" value={note ?? ""} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {transaction ? (
          <AttachmentsSection transactionId={transaction.id} />
        ) : (
          <p className="text-glass-3 text-xs">Save the transaction first to attach a receipt.</p>
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

function TransferForm({
  transfer,
  accounts,
  onClose,
  onSaved,
}: {
  transfer: Transfer | null;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(
    transfer?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  );
  const [amount, setAmount] = useState(transfer ? String(transfer.amount) : "");
  const [fromAccountId, setFromAccountId] = useState(
    transfer?.fromAccountId ?? accounts[0]?.id ?? ""
  );
  const [toAccountId, setToAccountId] = useState(
    transfer?.toAccountId ?? accounts[1]?.id ?? accounts[0]?.id ?? ""
  );
  const [note, setNote] = useState(transfer?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a positive amount.");
    if (!fromAccountId || !toAccountId) return setError("Pick both accounts.");
    if (fromAccountId === toAccountId) return setError("From and to must be different accounts.");

    const payload = {
      date: new Date(date).toISOString(),
      amount: value,
      fromAccountId,
      toAccountId,
      note: note || null,
    };
    setSaving(true);
    try {
      if (transfer) await api.updateTransfer(transfer.id, payload);
      else await api.createTransfer(payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal title={transfer ? "Edit Transfer" : "New Transfer"} onClose={onClose}>
      {accounts.length < 2 ? (
        <div className="space-y-4">
          <p className="text-sm text-glass-3">
            You need at least two accounts to make a transfer. Add another in Settings.
          </p>
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-glass-3">
            Transfers move money between your accounts. They aren't counted as income or expense.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                className="w-full"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Amount">
              <input
                type="number"
                step="0.01"
                min="0"
                className="num w-full"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="From account">
              <select
                className="w-full"
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="To account">
              <select
                className="w-full"
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Note (optional)">
            <input className="w-full" value={note ?? ""} onChange={(e) => setNote(e.target.value)} />
          </Field>

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
      )}
    </Modal>
  );
}

function ImportModal({
  accounts,
  onClose,
  onDone,
}: {
  accounts: Account[];
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [result, setResult] = useState<{ imported: number; failed: number; errors: { line: number; message: string }[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a CSV file.");
    setBusy(true);
    try {
      const res = await api.importCsv(file, accountId);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import Transactions (CSV)" onClose={onClose}>
      {result ? (
        <div className="space-y-4">
          <p className="text-sm text-glass">
            Imported <span className="num text-[#34e0c4]">{result.imported}</span> transaction(s).
            {result.failed > 0 && (
              <>
                {" "}
                <span className="num text-[#ff6b8a]">{result.failed}</span> failed.
              </>
            )}
          </p>
          {result.errors.length > 0 && (
            <ul className="num max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/30 p-2 text-xs text-[#ff9bae]">
              {result.errors.map((er, i) => (
                <li key={i}>
                  Line {er.line}: {er.message}
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <Button variant="primary" onClick={onDone}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-glass-3">
            Expected columns:{" "}
            <code className="text-glass">date, amount, type, category, description</code>.
            Unknown categories are created automatically.
          </p>
          <Field label="Import into account">
            <select className="w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="CSV file">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="w-full" />
          </Field>
          {error && <div className="text-sm text-[#ff6b8a]">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Importing…" : "Import"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const FREQUENCIES: RecurFrequency[] = ["weekly", "fortnightly", "monthly", "quarterly", "yearly"];

function RecurringManager({
  categories,
  accounts,
  onClose,
  onChange,
}: {
  categories: Category[];
  accounts: Account[];
  onClose: () => void;
  onChange: () => void;
}) {
  const { format } = useCurrency();
  const [rules, setRules] = useState<Recurring[]>([]);
  const [xfers, setXfers] = useState<RecurringTransfer[]>([]);
  const [editing, setEditing] = useState<Recurring | "new" | null>(null);
  const [editingXfer, setEditingXfer] = useState<RecurringTransfer | "new" | null>(null);

  const load = () => {
    api.listRecurring().then(setRules);
    api.listRecurringTransfers().then(setXfers);
  };
  useEffect(() => {
    load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("Delete this recurring rule? Already-posted items are kept.")) return;
    await api.deleteRecurring(id);
    load();
    onChange();
  };
  const removeXfer = async (id: string) => {
    if (!confirm("Delete this recurring transfer? Already-posted transfers are kept.")) return;
    await api.deleteRecurringTransfer(id);
    load();
    onChange();
  };

  const saved = () => {
    setEditing(null);
    setEditingXfer(null);
    load();
    onChange();
  };

  return (
    <Modal title="Recurring" onClose={onClose}>
      {editing ? (
        <RecurringForm
          rule={editing === "new" ? null : editing}
          categories={categories}
          accounts={accounts}
          onCancel={() => setEditing(null)}
          onSaved={saved}
        />
      ) : editingXfer ? (
        <RecurringTransferForm
          rule={editingXfer === "new" ? null : editingXfer}
          accounts={accounts}
          onCancel={() => setEditingXfer(null)}
          onSaved={saved}
        />
      ) : (
        <div className="space-y-4">
          {rules.length === 0 && xfers.length === 0 ? (
            <p className="text-glass-3 text-sm">
              No recurring rules yet. Add one and it will auto-post on schedule.
            </p>
          ) : (
            <ul className="divide-y divide-white/10">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-glass">{r.description || r.category.name}</div>
                    <div className="text-glass-3 text-xs capitalize">
                      {r.frequency} · next {formatDate(r.nextDate)} · {r.account.name}
                      {!r.active && " · paused"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="num" style={{ color: r.type === "income" ? "#34e0c4" : "#ff6b8a" }}>
                      {r.type === "income" ? "+" : "−"}
                      {format(r.amount)}
                    </span>
                    <button className="text-xs text-[#64d2ff] hover:underline" onClick={() => setEditing(r)}>
                      edit
                    </button>
                    <button className="text-xs text-[#ff6b8a] hover:underline" onClick={() => remove(r.id)}>
                      delete
                    </button>
                  </div>
                </li>
              ))}
              {xfers.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-glass">
                      <span className="text-balance mr-1 inline-block align-[-2px]">
                        <ArrowLeftRight size={12} strokeWidth={2} />
                      </span>
                      {r.fromAccount.name} → {r.toAccount.name}
                    </div>
                    <div className="text-glass-3 text-xs capitalize">
                      {r.frequency} · next {formatDate(r.nextDate)}
                      {!r.active && " · paused"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="num" style={{ color: "#64d2ff" }}>
                      {format(r.amount)}
                    </span>
                    <button className="text-xs text-[#64d2ff] hover:underline" onClick={() => setEditingXfer(r)}>
                      edit
                    </button>
                    <button className="text-xs text-[#ff6b8a] hover:underline" onClick={() => removeXfer(r.id)}>
                      delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditingXfer("new")}>+ Recurring transfer</Button>
            <Button variant="primary" onClick={() => setEditing("new")}>
              + Recurring transaction
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RecurringTransferForm({
  rule,
  accounts,
  onCancel,
  onSaved,
}: {
  rule: RecurringTransfer | null;
  accounts: Account[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(rule ? String(rule.amount) : "");
  const [fromAccountId, setFromAccountId] = useState(rule?.fromAccountId ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(rule?.toAccountId ?? accounts[1]?.id ?? "");
  const [frequency, setFrequency] = useState<RecurFrequency>(rule?.frequency ?? "monthly");
  const [nextDate, setNextDate] = useState(
    rule?.nextDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(rule?.endDate?.slice(0, 10) ?? "");
  const [note, setNote] = useState(rule?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a positive amount.");
    if (!fromAccountId || !toAccountId) return setError("Pick both accounts.");
    if (fromAccountId === toAccountId) return setError("From and to must differ.");

    const payload = {
      amount: value,
      fromAccountId,
      toAccountId,
      frequency,
      nextDate: new Date(nextDate).toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : null,
      note: note || null,
    };
    setSaving(true);
    try {
      if (rule) await api.updateRecurringTransfer(rule.id, payload);
      else await api.createRecurringTransfer(payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input
            type="number"
            step="0.01"
            min="0"
            className="num w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Frequency">
          <select
            className="w-full capitalize"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurFrequency)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From account">
          <select className="w-full" value={fromAccountId} onChange={(e) => setFromAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To account">
          <select className="w-full" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={rule ? "Next date" : "Start date"}>
          <input type="date" className="w-full" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
        </Field>
        <Field label="End date (optional)">
          <input type="date" className="w-full" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Note (optional)">
        <input className="w-full" value={note ?? ""} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <div className="text-sm text-[#ff6b8a]">{error}</div>}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function RecurringForm({
  rule,
  categories,
  accounts,
  onCancel,
  onSaved,
}: {
  rule: Recurring | null;
  categories: Category[];
  accounts: Account[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<TxnType>(rule?.type ?? "expense");
  const [amount, setAmount] = useState(rule ? String(rule.amount) : "");
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? "");
  const [accountId, setAccountId] = useState(rule?.accountId ?? accounts[0]?.id ?? "");
  const [frequency, setFrequency] = useState<RecurFrequency>(rule?.frequency ?? "monthly");
  const [nextDate, setNextDate] = useState(
    rule?.nextDate.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState(rule?.endDate?.slice(0, 10) ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [note, setNote] = useState(rule?.note ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const visibleCategories = categories.filter((c) => c.type === type);
  useEffect(() => {
    if (!visibleCategories.some((c) => c.id === categoryId)) {
      setCategoryId(visibleCategories[0]?.id ?? "");
    }
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a positive amount.");
    if (!categoryId) return setError("Pick a category.");
    if (!accountId) return setError("Pick an account.");

    const payload = {
      type,
      amount: value,
      categoryId,
      accountId,
      frequency,
      nextDate: new Date(nextDate).toISOString(),
      endDate: endDate ? new Date(endDate).toISOString() : null,
      description,
      note: note || null,
    };
    setSaving(true);
    try {
      if (rule) await api.updateRecurring(rule.id, payload);
      else await api.createRecurring(payload);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex gap-2">
        {(["expense", "income"] as TxnType[]).map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 border px-3 py-2 text-sm capitalize transition-colors ${
              type === t
                ? t === "income"
                  ? "border-[#34e0c4] bg-[#34e0c4]/10 text-[#34e0c4]"
                  : "border-[#ff6b8a] bg-[#ff6b8a]/10 text-[#ff9bae]"
                : "border-white/10 bg-white/5 text-glass-3"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input
            type="number"
            step="0.01"
            min="0"
            className="num w-full"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Frequency">
          <select
            className="w-full capitalize"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as RecurFrequency)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className="w-full" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select…</option>
            {visibleCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Account">
          <select className="w-full" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={rule ? "Next date" : "Start date"}>
          <input
            type="date"
            className="w-full"
            value={nextDate}
            onChange={(e) => setNextDate(e.target.value)}
          />
        </Field>
        <Field label="End date (optional)">
          <input
            type="date"
            className="w-full"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Description">
        <input className="w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Note (optional)">
        <input className="w-full" value={note ?? ""} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {error && <div className="text-sm text-[#ff6b8a]">{error}</div>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
