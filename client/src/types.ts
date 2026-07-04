export type TxnType = "income" | "expense";

export interface User {
  id: string;
  email: string;
}

export type TaxTag = "interest" | "dividend" | "giftAid";

export interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
  openingBalance: number;
  isIsa: boolean;
  isPremiumBonds: boolean;
  isInvestment: boolean;
  isPension: boolean;
  interestRate: number;
  volatility: number;
  createdAt?: string;
}

export interface AccountRef {
  id: string;
  name: string;
}

export interface Valuation {
  id: string;
  accountId: string;
  date: string;
  value: number;
  note: string | null;
}

export interface Transfer {
  id: string;
  date: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  fromAccount: AccountRef;
  toAccount: AccountRef;
  note: string | null;
}

export interface Category {
  id: string;
  name: string;
  type: TxnType;
  color: string;
  taxTag: TaxTag | null;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface TransactionSplit {
  id: string;
  categoryId: string;
  category: Category;
  amount: number;
}

export interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: TxnType;
  description: string;
  note: string | null;
  categoryId: string;
  accountId: string;
  category: Category;
  account: Account;
  recurringId: string | null;
  splits: TransactionSplit[];
}

export type RecurFrequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export interface Recurring {
  id: string;
  type: TxnType;
  amount: number;
  description: string;
  note: string | null;
  categoryId: string;
  accountId: string;
  category: Category;
  account: Account;
  frequency: RecurFrequency;
  nextDate: string;
  endDate: string | null;
  active: boolean;
}

export interface RecurringTransfer {
  id: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  fromAccount: AccountRef;
  toAccount: AccountRef;
  note: string | null;
  frequency: RecurFrequency;
  nextDate: string;
  endDate: string | null;
  active: boolean;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDate: string | null;
  accountId: string | null;
  accountName: string | null;
  saved: number;
  remaining: number;
  progress: number;
}

export interface NetWorthPoint {
  month: string;
  netWorth: number;
}

export interface IsaAllowance {
  taxYearLabel: string;
  start: string;
  end: string;
  allowance: number;
  used: number;
  remaining: number;
  isaAccounts: { id: string; name: string }[];
  hasIsa: boolean;
}

export interface Budget {
  id: string;
  categoryId: string;
  month: string;
  amount: number;
  spent: number;
  category: Category;
}

export interface Settings {
  userId: string;
  currency: string;
}

export interface Totals {
  income: number;
  expenses: number;
  net: number;
}

export interface AccountBalance {
  id: string;
  name: string;
  type: string;
  currency: string;
  isIsa: boolean;
  isPremiumBonds: boolean;
  isInvestment: boolean;
  isPension: boolean;
  interestRate: number;
  balance: number; // in the account's own currency
  baseBalance: number; // converted to the base/display currency
}

export interface ExchangeRate {
  id: string;
  currency: string;
  rate: number;
}

export interface TaxSummary {
  taxYearLabel: string;
  start: string;
  end: string;
  income: { total: number; byCategory: { name: string; total: number }[] };
  interest: { taxable: number; taxFree: number };
  dividends: { taxable: number; taxFree: number; allowance: number };
  giftAid: number;
  pension: { contributions: number; allowance: number; remaining: number };
  isa: { contributions: number; allowance: number; remaining: number };
  capitalGains: { tracked: boolean; note: string };
  estimate: {
    taxableIncome: number;
    personalAllowance: number;
    personalSavingsAllowance: number;
    nonDividendTax: number;
    dividendTax: number;
    total: number;
    effectiveRate: number;
  };
}

export interface InvestmentForecastMonth {
  month: string;
  monthIndex: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  invested: number;
}

export interface InvestmentForecast {
  accounts: {
    id: string;
    name: string;
    isIsa: boolean;
    expectedReturn: number;
    volatility: number;
    startingBalance: number;
  }[];
  startingValue: number;
  monthlyContribution: number;
  expectedReturn: number;
  volatility: number;
  months: InvestmentForecastMonth[];
  target: number | null;
  summary: {
    finalP10: number;
    finalP25: number;
    finalP50: number;
    finalP75: number;
    finalP90: number;
    finalMean: number;
    totalContributed: number;
    invested: number;
    medianProfit: number;
    probProfit: number;
    probTarget: number | null;
  };
}

export interface ForecastMonth {
  month: string;
  income: number;
  expenses: number;
  interest: number;
  taxFreeInterest: number;
  net: number;
  balance: number;
  liabilities: number; // total owed remaining that month
  netWorth: number; // balance + other assets − liabilities
}

export interface ForecastLiability {
  id: string;
  name: string;
  type: string;
  startingBalance: number;
  projectedBalance: number;
  payoffMonth: number | null; // month index it clears, or null if still owing
}

export interface ForecastAccount {
  id: string;
  name: string;
  type: string;
  isIsa: boolean;
  isPremiumBonds: boolean;
  interestRate: number;
  startingBalance: number;
  projectedBalance: number;
}

export interface Forecast {
  assumptions: {
    monthlyIncome: number;
    monthlyExpenses: number;
    lookbackMonths: number;
    avgIncome: number;
    avgExpenses: number;
  };
  startingBalance: number;
  endingBalance: number;
  otherAssets: number;
  startingLiabilities: number;
  endingLiabilities: number;
  startingNetWorth: number;
  endingNetWorth: number;
  accounts: ForecastAccount[];
  liabilities: ForecastLiability[];
  months: ForecastMonth[];
  totals: { income: number; expenses: number; interest: number; taxFreeInterest: number; net: number };
}

export interface Liability {
  id: string;
  name: string;
  type: string; // loan | mortgage | lease | credit | other
  currency: string;
  balance: number; // outstanding amount owed
  interestRate: number;
  monthlyPayment: number;
  note: string | null;
  createdAt?: string;
}

export interface LiabilityBalance extends Liability {
  baseBalance: number; // owed, in the base currency
}

export interface Asset {
  id: string;
  name: string;
  type: string; // property | vehicle | valuables | cash | other
  currency: string;
  value: number;
  note: string | null;
  createdAt?: string;
}

export interface AssetBalance extends Asset {
  baseValue: number; // worth, in the base currency
}

export interface Balances {
  accounts: AccountBalance[];
  liabilities: LiabilityBalance[];
  otherAssets: AssetBalance[];
  overall: number; // total account balances, in the base currency (kept for compatibility)
  accountsTotal: number; // total account balances, in the base currency
  otherAssetsTotal: number; // total other-asset value, in the base currency
  assets: number; // accounts + other assets, in the base currency
  liabilitiesTotal: number; // total owed, in the base currency
  netWorth: number; // assets − liabilities
  baseCurrency: string;
}

export interface CategoryTotal {
  categoryId: string;
  category: string;
  color: string;
  total: number;
}

export interface TrendPoint {
  month: string;
  income: number;
  expenses: number;
  net: number;
}
