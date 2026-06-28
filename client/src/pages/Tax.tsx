import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { TaxSummary } from "../types";
import { Button, SectionTitle, StatTile, Tile } from "../components/ui";
import { currentTaxYear } from "../lib/period";
import { useCurrency } from "../lib/CurrencyContext";

export default function Tax() {
  const { format, currency } = useCurrency();
  const [year, setYear] = useState(currentTaxYear());
  const [data, setData] = useState<TaxSummary | null>(null);

  useEffect(() => {
    api.taxSummary(year).then(setData);
  }, [year]);

  const years: number[] = [];
  for (let y = currentTaxYear(); y >= currentTaxYear() - 6; y--) years.push(y);

  const exportCsv = () => {
    if (!data) return;
    const rows: [string, number | string][] = [
      ["Tax year", data.taxYearLabel],
      ["Total income (all categories)", data.income.total],
      ...data.income.byCategory.map((c) => [`Income — ${c.name}`, c.total] as [string, number]),
      ["Taxable UK interest", data.interest.taxable],
      ["Tax-free interest (ISA/Premium Bonds, excluded)", data.interest.taxFree],
      ["Taxable dividends", data.dividends.taxable],
      ["Dividend allowance", data.dividends.allowance],
      ["Gift Aid donations", data.giftAid],
      ["Personal pension contributions", data.pension.contributions],
      ["Pension annual allowance remaining", data.pension.remaining],
      ["ISA subscriptions (not taxable)", data.isa.contributions],
      ["Capital gains", "not tracked"],
    ];
    const csv = ["Field,Amount", ...rows.map(([k, v]) => `"${k}","${v}"`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tax-summary-${data.taxYearLabel.replace("/", "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-glass">Tax Year Summary</h1>
          <p className="text-glass-3 mt-1 text-[13px]">
            Figures for UK Self Assessment · {data?.taxYearLabel ?? ""} (6 Apr – 5 Apr)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Tax year"
            className="num"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}/{String((y + 1) % 100).padStart(2, "0")}
              </option>
            ))}
          </select>
          <Button onClick={exportCsv}>Export CSV</Button>
        </div>
      </header>

      {!data ? (
        <div className="text-glass-3 py-20 text-center text-sm">Loading…</div>
      ) : (
        <>
          {/* Headline figures */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-4">
            <StatTile label="Total Income" value={format(data.income.total)} tone="income" icon="↑" />
            <StatTile
              label="Taxable Interest"
              value={format(data.interest.taxable)}
              tone="accent"
              icon="%"
            />
            <StatTile
              label="Taxable Dividends"
              value={format(data.dividends.taxable)}
              tone="accent"
              icon="◈"
            />
            <StatTile
              label="Pension Paid In"
              value={format(data.pension.contributions)}
              tone="default"
              icon="↓"
            />
            <StatTile
              label="Est. Income Tax"
              value={format(data.estimate.total)}
              tone="expense"
              icon="£"
              sub={`~${data.estimate.effectiveRate}% effective · rough estimate`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Income by category */}
            <Tile className="p-[22px]">
              <SectionTitle>Income by Category</SectionTitle>
              <ul className="divide-y divide-white/10">
                {data.income.byCategory.map((c) => (
                  <li key={c.name} className="flex justify-between py-2 text-sm">
                    <span className="text-glass">{c.name}</span>
                    <span className="num text-glass">{format(c.total)}</span>
                  </li>
                ))}
                <li className="flex justify-between py-2 text-sm font-semibold">
                  <span className="text-glass">Total</span>
                  <span className="num text-glass">{format(data.income.total)}</span>
                </li>
              </ul>
              <p className="text-glass-3 mt-2 text-xs">
                A starting point — check salary against your P60/payslips, as PAYE income is reported
                there.
              </p>
            </Tile>

            {/* Savings & dividends */}
            <Tile className="p-[22px]">
              <SectionTitle>Savings & Investment Income</SectionTitle>
              <ReportRow label="Taxable UK interest" value={format(data.interest.taxable)} />
              <ReportRow
                label="Interest in ISA / Premium Bonds (tax-free)"
                value={format(data.interest.taxFree)}
                muted
              />
              <ReportRow label="Taxable dividends" value={format(data.dividends.taxable)} />
              <ReportRow
                label="Dividends in ISA / pension (tax-free)"
                value={format(data.dividends.taxFree)}
                muted
              />
              <p className="text-glass-3 mt-2 text-xs">
                Banks report interest to HMRC. A Personal Savings Allowance (£1,000 basic-rate /
                £500 higher-rate) and the £{data.dividends.allowance} dividend allowance may mean no
                tax is due — enter the gross figures.
              </p>
            </Tile>

            {/* Reliefs */}
            <Tile className="p-[22px]">
              <SectionTitle>Reliefs & Contributions</SectionTitle>
              <ReportRow label="Gift Aid donations" value={format(data.giftAid)} />
              <ReportRow
                label="Personal pension contributions"
                value={format(data.pension.contributions)}
              />
              <ReportRow
                label="Pension annual allowance remaining"
                value={format(data.pension.remaining)}
                muted
              />
              <p className="text-glass-3 mt-2 text-xs">
                Pension contributions tracked here are transfers into pension accounts. Employer or
                salary-sacrifice contributions that never hit your accounts aren't captured. Higher-
                and additional-rate taxpayers can claim extra relief on personal pension and Gift Aid
                payments.
              </p>
            </Tile>

            {/* ISA + CGT */}
            <Tile className="p-[22px]">
              <SectionTitle>Not on Your Return</SectionTitle>
              <ReportRow
                label={`ISA subscriptions (£${data.isa.remaining.toLocaleString()} of £20,000 left)`}
                value={format(data.isa.contributions)}
                muted
              />
              <p className="text-glass-3 mt-1 text-xs">
                ISA income and gains are tax-free and aren't reported on a tax return.
              </p>
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="text-glass text-sm">Capital gains</div>
                <p className="text-glass-3 mt-1 text-xs">{data.capitalGains.note}</p>
              </div>
            </Tile>
          </div>

          {/* Rough tax estimate */}
          <Tile className="p-[22px]">
            <SectionTitle>Estimated Income Tax (very rough)</SectionTitle>
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <ReportRow label="Taxable income (total)" value={format(data.estimate.taxableIncome)} />
                <ReportRow label="Personal allowance" value={format(data.estimate.personalAllowance)} muted />
                <ReportRow
                  label="Personal savings allowance"
                  value={format(data.estimate.personalSavingsAllowance)}
                  muted
                />
              </div>
              <div>
                <ReportRow label="Tax on income & interest" value={format(data.estimate.nonDividendTax)} />
                <ReportRow label="Tax on dividends" value={format(data.estimate.dividendTax)} />
                <ReportRow
                  label={`Estimated total (≈${data.estimate.effectiveRate}%)`}
                  value={format(data.estimate.total)}
                />
              </div>
            </div>
            <p className="text-glass-3 mt-3 text-xs">
              A ballpark only — England/Wales/NI rates, and it <span className="text-glass">ignores
              National Insurance, student-loan repayments, the savings starting-rate band, Scottish
              rates and more</span>. Do not use it to file; it's just to sanity-check.
            </p>
          </Tile>

          <p className="text-glass-3 text-xs">
            This is a tool to help gather figures, not tax advice. Verify everything against your own
            records before filing, and consult HMRC or an accountant if unsure. Amounts shown in{" "}
            {currency}.
          </p>
        </>
      )}
    </div>
  );
}

function ReportRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 py-2 text-sm last:border-0">
      <span className={muted ? "text-glass-3" : "text-glass"}>{label}</span>
      <span className={`num ${muted ? "text-glass-3" : "text-glass"}`}>{value}</span>
    </div>
  );
}
