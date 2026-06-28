/**
 * A ROUGH UK income-tax estimate (England/Wales/NI rates). Deliberately
 * simplified — it ignores National Insurance, student loans, the savings
 * starting-rate band, Scottish rates, Marriage Allowance, etc. — so it is only
 * a ballpark, never a substitute for HMRC's own calculation.
 *
 * 2024/25 thresholds: personal allowance £12,570 (tapered above £100k),
 * basic-rate band £37,700, additional-rate threshold £125,140.
 */
const PERSONAL_ALLOWANCE = 12570;
const BASIC_BAND = 37700; // taxable income taxed at basic rate
const ADDITIONAL_THRESHOLD = 125140; // total income where additional rate starts
const DIVIDEND_ALLOWANCE = 500;

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(n, hi));

export interface TaxEstimateInput {
  nonSavings: number; // employment, self-employment, other (excl. dividends & interest)
  savingsInterest: number; // taxable interest
  dividends: number; // taxable dividends
}

export interface TaxEstimate {
  taxableIncome: number;
  personalAllowance: number;
  personalSavingsAllowance: number;
  nonDividendTax: number;
  dividendTax: number;
  total: number;
  effectiveRate: number; // % of total income
}

export function estimateIncomeTax(input: TaxEstimateInput): TaxEstimate {
  const nonSavings = Math.max(input.nonSavings, 0);
  const savings = Math.max(input.savingsInterest, 0);
  const dividends = Math.max(input.dividends, 0);
  const totalIncome = nonSavings + savings + dividends;

  // Tapered personal allowance.
  let pa = PERSONAL_ALLOWANCE;
  if (totalIncome > 100000) pa = Math.max(0, PERSONAL_ALLOWANCE - (totalIncome - 100000) / 2);

  // Rough band the taxpayer sits in, used for the Personal Savings Allowance.
  const band = totalIncome <= pa + BASIC_BAND ? "basic" : totalIncome <= ADDITIONAL_THRESHOLD ? "higher" : "additional";
  const psa = band === "basic" ? 1000 : band === "higher" ? 500 : 0;

  // Non-dividend taxable income (after PA and PSA).
  const savingsTaxable = Math.max(savings - psa, 0);
  const nonDivTaxable = Math.max(nonSavings + savingsTaxable - pa, 0);

  const basicTop = BASIC_BAND;
  const higherTop = Math.max(ADDITIONAL_THRESHOLD - pa, basicTop);

  let nonDividendTax = 0;
  nonDividendTax += Math.min(nonDivTaxable, basicTop) * 0.2;
  nonDividendTax += clamp(nonDivTaxable - basicTop, 0, higherTop - basicTop) * 0.4;
  nonDividendTax += Math.max(nonDivTaxable - higherTop, 0) * 0.45;

  // Dividends stack on top of the non-dividend taxable income.
  const divTaxable = Math.max(dividends - DIVIDEND_ALLOWANCE, 0);
  let dividendTax = 0;
  let cursor = nonDivTaxable;
  let remaining = divTaxable;
  const take = (edge: number, rate: number) => {
    if (remaining <= 0) return;
    const amt = Math.min(remaining, Math.max(edge - cursor, 0));
    dividendTax += amt * rate;
    cursor += amt;
    remaining -= amt;
  };
  take(basicTop, 0.0875);
  take(higherTop, 0.3375);
  dividendTax += remaining * 0.3935;

  const total = nonDividendTax + dividendTax;
  return {
    taxableIncome: round(totalIncome),
    personalAllowance: round(pa),
    personalSavingsAllowance: psa,
    nonDividendTax: round(nonDividendTax),
    dividendTax: round(dividendTax),
    total: round(total),
    effectiveRate: totalIncome > 0 ? round((total / totalIncome) * 100) : 0,
  };
}
