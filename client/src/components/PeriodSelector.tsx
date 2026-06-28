import { buildPeriod, type Period, type PeriodMode } from "../lib/period";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Period picker: month / calendar year / UK tax year / custom range, and
 * optionally all-time. Emits a fully-computed Period (start/end/label).
 */
export function PeriodSelector({
  value,
  onChange,
  yearsBack = 6,
  allowAll = false,
}: {
  value: Period;
  onChange: (p: Period) => void;
  yearsBack?: number;
  allowAll?: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = currentYear; y >= currentYear - yearsBack; y--) years.push(y);
  if (!years.includes(value.year)) {
    years.push(value.year);
    years.sort((a, b) => b - a);
  }

  const emit = (patch: Partial<Period>) => onChange(buildPeriod({ ...value, ...patch }));

  const modes: { id: PeriodMode; label: string }[] = [
    { id: "month", label: "Month" },
    { id: "year", label: "Calendar year" },
    { id: "taxYear", label: "Tax year" },
    { id: "custom", label: "Custom range" },
    ...(allowAll ? [{ id: "all" as PeriodMode, label: "All time" }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <select
        aria-label="Period type"
        value={value.mode}
        onChange={(e) => emit({ mode: e.target.value as PeriodMode })}
      >
        {modes.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>

      {value.mode === "month" && (
        <>
          <select
            aria-label="Month"
            className="num"
            value={value.month}
            onChange={(e) => emit({ month: Number(e.target.value) })}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            className="num"
            value={value.year}
            onChange={(e) => emit({ year: Number(e.target.value) })}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </>
      )}

      {value.mode === "year" && (
        <select
          aria-label="Year"
          className="num"
          value={value.year}
          onChange={(e) => emit({ year: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}

      {value.mode === "taxYear" && (
        <select
          aria-label="Tax year"
          className="num"
          value={value.year}
          onChange={(e) => emit({ year: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}/{String((y + 1) % 100).padStart(2, "0")}
            </option>
          ))}
        </select>
      )}

      {value.mode === "custom" && (
        <>
          <input
            type="date"
            aria-label="From"
            className="num"
            value={value.from}
            max={value.to}
            onChange={(e) => emit({ from: e.target.value })}
          />
          <span className="text-glass-3 text-sm">to</span>
          <input
            type="date"
            aria-label="To"
            className="num"
            value={value.to}
            min={value.from}
            onChange={(e) => emit({ to: e.target.value })}
          />
        </>
      )}
    </div>
  );
}
