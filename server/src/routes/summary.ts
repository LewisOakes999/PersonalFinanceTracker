import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { toNumber } from "../lib/serialize.js";
import { accountBalances } from "../lib/balances.js";
import { monteCarlo } from "../lib/montecarlo.js";
import { resolveRange } from "../lib/range.js";
import { getConversion } from "../lib/currency.js";

export const summaryRouter = Router();

function monthRange(month: string) {
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

// GET /api/summary/totals?month=YYYY-MM — income/expense/net for the month.
summaryRouter.get(
  "/totals",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const { start, end } = resolveRange(req) ?? monthRange(currentMonth());

    const [grouped, accounts, conv] = await Promise.all([
      prisma.transaction.groupBy({
        by: ["accountId", "type"],
        _sum: { amount: true },
        where: { userId, date: { gte: start, lt: end } },
      }),
      prisma.account.findMany({ where: { userId }, select: { id: true, currency: true } }),
      getConversion(userId),
    ]);
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));

    let income = 0;
    let expenses = 0;
    for (const row of grouped) {
      const amt = conv.toBase(toNumber(row._sum.amount), currencyOf.get(row.accountId) ?? conv.base);
      if (row.type === "income") income += amt;
      else expenses += amt;
    }
    const round2 = (n: number) => Math.round(n * 100) / 100;
    res.json({ income: round2(income), expenses: round2(expenses), net: round2(income - expenses) });
  })
);

// GET /api/summary/balances — opening balance + net flow per account, plus overall.
summaryRouter.get(
  "/balances",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const [accounts, liabilityRows, assetRows] = await Promise.all([
      prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.liability.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.asset.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    ]);
    const [balanceMap, conv] = await Promise.all([accountBalances(userId), getConversion(userId)]);

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const balances = accounts.map((account) => {
      const balance = balanceMap.get(account.id) ?? 0;
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        isIsa: account.isIsa,
        isPremiumBonds: account.isPremiumBonds,
        isInvestment: account.isInvestment,
        isPension: account.isPension,
        interestRate: toNumber(account.interestRate),
        termStart: account.termStart,
        maturityDate: account.maturityDate,
        interestPaid: account.interestPaid,
        balance,
        baseBalance: round2(conv.toBase(balance, account.currency)),
      };
    });

    const liabilities = liabilityRows.map((l) => {
      const balance = toNumber(l.balance);
      return {
        id: l.id,
        name: l.name,
        type: l.type,
        currency: l.currency,
        interestRate: toNumber(l.interestRate),
        monthlyPayment: toNumber(l.monthlyPayment),
        note: l.note,
        balance,
        baseBalance: round2(conv.toBase(balance, l.currency)),
      };
    });

    const otherAssets = assetRows.map((a) => {
      const value = toNumber(a.value);
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        note: a.note,
        value,
        baseValue: round2(conv.toBase(value, a.currency)),
      };
    });

    const accountsTotal = round2(balances.reduce((sum, a) => sum + a.baseBalance, 0));
    const otherAssetsTotal = round2(otherAssets.reduce((sum, a) => sum + a.baseValue, 0));
    const assets = round2(accountsTotal + otherAssetsTotal);
    const liabilitiesTotal = round2(liabilities.reduce((sum, l) => sum + l.baseBalance, 0));
    res.json({
      accounts: balances,
      liabilities,
      otherAssets,
      // `overall` kept for backward compatibility (= total account balances).
      overall: accountsTotal,
      accountsTotal,
      otherAssetsTotal,
      assets, // accounts + other assets
      liabilitiesTotal,
      netWorth: round2(assets - liabilitiesTotal),
      baseCurrency: conv.base,
    });
  })
);

// GET /api/summary/by-category?month=YYYY-MM&type=expense — totals grouped by category.
summaryRouter.get(
  "/by-category",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const type = req.query.type === "income" ? "income" : "expense";
    const { start, end } = resolveRange(req) ?? monthRange(currentMonth());

    const [txns, categories, accounts, conv] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, type, date: { gte: start, lt: end } },
        select: {
          amount: true,
          categoryId: true,
          accountId: true,
          splits: { select: { categoryId: true, amount: true } },
        },
      }),
      prisma.category.findMany({ where: { userId } }),
      prisma.account.findMany({ where: { userId }, select: { id: true, currency: true } }),
      getConversion(userId),
    ]);
    const byId = new Map(categories.map((c) => [c.id, c]));
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));

    // Sum each category's spend (using split line items where present) in base currency.
    const totals = new Map<string, number>();
    for (const t of txns) {
      const currency = currencyOf.get(t.accountId) ?? conv.base;
      if (t.splits.length > 0) {
        for (const s of t.splits) {
          const amt = conv.toBase(toNumber(s.amount), currency);
          totals.set(s.categoryId, (totals.get(s.categoryId) ?? 0) + amt);
        }
      } else {
        const amt = conv.toBase(toNumber(t.amount), currency);
        totals.set(t.categoryId, (totals.get(t.categoryId) ?? 0) + amt);
      }
    }

    const result = [...totals.entries()]
      .map(([categoryId, total]) => {
        const category = byId.get(categoryId);
        return {
          categoryId,
          category: category?.name ?? "Unknown",
          color: category?.color ?? "#64748b",
          total: Math.round(total * 100) / 100,
        };
      })
      .sort((a, b) => b.total - a.total);

    res.json(result);
  })
);

// GET /api/summary/trend?months=12 — income/expense totals per month for trend charts.
summaryRouter.get(
  "/trend",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 36);

    // Build the list of months ending with the current month.
    const labels: string[] = [];
    const cursor = new Date();
    cursor.setUTCDate(1);
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(cursor);
      d.setUTCMonth(d.getUTCMonth() - i);
      labels.push(d.toISOString().slice(0, 7));
    }

    const start = monthRange(labels[0]).start;
    const end = monthRange(labels[labels.length - 1]).end;

    const txns = await prisma.transaction.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { date: true, type: true, amount: true },
    });

    const buckets = new Map(labels.map((m) => [m, { month: m, income: 0, expenses: 0 }]));
    for (const txn of txns) {
      const key = txn.date.toISOString().slice(0, 7);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (txn.type === "income") bucket.income += toNumber(txn.amount);
      else bucket.expenses += toNumber(txn.amount);
    }

    res.json([...buckets.values()].map((b) => ({ ...b, net: b.income - b.expenses })));
  })
);

// GET /api/summary/forecast?months=12&monthlyIncome=&monthlyExpenses=&lookback=6
// Projects future income, expenses and per-account interest. Income/expenses default
// to the average of the last `lookback` months; each account compounds its AER monthly.
summaryRouter.get(
  "/forecast",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 60);
    const lookback = Math.min(Math.max(Number(req.query.lookback) || 6, 1), 24);

    // Accounts and their current balances, plus liabilities & other assets.
    const [accounts, liabilityRows, assetRows] = await Promise.all([
      prisma.account.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.liability.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.asset.findMany({ where: { userId } }),
    ]);
    const balanceMap = await accountBalances(userId);
    const currentBalance = (id: string) => balanceMap.get(id) ?? 0;

    // Historical averages over the last `lookback` complete months (before this month).
    const histEnd = new Date();
    histEnd.setUTCDate(1);
    histEnd.setUTCHours(0, 0, 0, 0);
    const histStart = new Date(histEnd);
    histStart.setUTCMonth(histStart.getUTCMonth() - lookback);
    const histGrouped = await prisma.transaction.groupBy({
      by: ["type"],
      _sum: { amount: true },
      where: { userId, date: { gte: histStart, lt: histEnd } },
    });
    let incomeSum = 0;
    let expenseSum = 0;
    for (const row of histGrouped) {
      if (row.type === "income") incomeSum = toNumber(row._sum.amount);
      else expenseSum = toNumber(row._sum.amount);
    }
    const avgIncome = Math.round((incomeSum / lookback) * 100) / 100;
    const avgExpenses = Math.round((expenseSum / lookback) * 100) / 100;

    const monthlyIncome =
      req.query.monthlyIncome != null ? Number(req.query.monthlyIncome) : avgIncome;
    const monthlyExpenses =
      req.query.monthlyExpenses != null ? Number(req.query.monthlyExpenses) : avgExpenses;

    // Running per-account balances; operating surplus lands in the first account.
    const balances = new Map<string, number>();
    for (const a of accounts) {
      balances.set(a.id, currentBalance(a.id));
    }
    const primaryId = accounts[0]?.id;
    const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1;
    const rateById = new Map(accounts.map((a) => [a.id, monthlyRate(toNumber(a.interestRate))]));

    // Other assets are treated as constant over the horizon.
    const otherAssetsTotal = Math.round(assetRows.reduce((s, a) => s + toNumber(a.value), 0) * 100) / 100;

    // Project each liability's paydown: interest accrues, the monthly payment
    // reduces the balance (floored at zero). Payments are assumed to be part of
    // regular expenses, so account cash isn't reduced again here.
    const liabState = liabilityRows.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      startingBalance: Math.round(toNumber(l.balance) * 100) / 100,
      balance: toNumber(l.balance),
      rate: monthlyRate(toNumber(l.interestRate)),
      payment: toNumber(l.monthlyPayment),
      payoffMonth: null as number | null,
    }));
    const liabTotal = () => Math.round(liabState.reduce((s, l) => s + l.balance, 0) * 100) / 100;
    const startingLiabilities = liabTotal();

    // Build future month labels (starting next month).
    const cursor = new Date();
    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);
    const startingBalance = [...balances.values()].reduce((s, v) => s + v, 0);

    const rows: {
      month: string;
      income: number;
      expenses: number;
      interest: number;
      taxFreeInterest: number;
      net: number;
      balance: number;
      liabilities: number;
      netWorth: number;
    }[] = [];

    for (let m = 1; m <= months; m++) {
      const d = new Date(cursor);
      d.setUTCMonth(d.getUTCMonth() + m);
      const label = d.toISOString().slice(0, 7);

      let interest = 0;
      let taxFreeInterest = 0;
      for (const a of accounts) {
        const bal = balances.get(a.id) ?? 0;
        const earned = bal * (rateById.get(a.id) ?? 0);
        interest += earned;
        if (a.isIsa || a.isPremiumBonds) taxFreeInterest += earned;
        balances.set(a.id, bal + earned);
      }
      const surplus = monthlyIncome - monthlyExpenses;
      if (primaryId) balances.set(primaryId, (balances.get(primaryId) ?? 0) + surplus);

      const total = [...balances.values()].reduce((s, v) => s + v, 0);

      // Step each liability's paydown for this month.
      for (const l of liabState) {
        if (l.balance <= 0) continue;
        const next = l.balance * (1 + l.rate) - l.payment;
        l.balance = next > 0 ? next : 0;
        if (l.balance === 0 && l.payoffMonth === null) l.payoffMonth = m;
      }
      const liabilitiesRemaining = liabTotal();

      rows.push({
        month: label,
        income: monthlyIncome,
        expenses: monthlyExpenses,
        interest: Math.round(interest * 100) / 100,
        taxFreeInterest: Math.round(taxFreeInterest * 100) / 100,
        net: Math.round((surplus + interest) * 100) / 100,
        balance: Math.round(total * 100) / 100,
        liabilities: liabilitiesRemaining,
        netWorth: Math.round((total + otherAssetsTotal - liabilitiesRemaining) * 100) / 100,
      });
    }

    const totals = rows.reduce(
      (acc, r) => ({
        income: acc.income + r.income,
        expenses: acc.expenses + r.expenses,
        interest: Math.round((acc.interest + r.interest) * 100) / 100,
        taxFreeInterest: Math.round((acc.taxFreeInterest + r.taxFreeInterest) * 100) / 100,
        net: Math.round((acc.net + r.net) * 100) / 100,
      }),
      { income: 0, expenses: 0, interest: 0, taxFreeInterest: 0, net: 0 }
    );

    const endingBalance = rows.length ? rows[rows.length - 1].balance : startingBalance;
    const endingLiabilities = rows.length ? rows[rows.length - 1].liabilities : startingLiabilities;
    const round2f = (n: number) => Math.round(n * 100) / 100;

    res.json({
      assumptions: { monthlyIncome, monthlyExpenses, lookbackMonths: lookback, avgIncome, avgExpenses },
      startingBalance: round2f(startingBalance),
      endingBalance,
      otherAssets: otherAssetsTotal,
      startingLiabilities,
      endingLiabilities,
      startingNetWorth: round2f(startingBalance + otherAssetsTotal - startingLiabilities),
      endingNetWorth: round2f(endingBalance + otherAssetsTotal - endingLiabilities),
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        isIsa: a.isIsa,
        isPremiumBonds: a.isPremiumBonds,
        interestRate: toNumber(a.interestRate),
        startingBalance: Math.round(currentBalance(a.id) * 100) / 100,
        projectedBalance: Math.round((balances.get(a.id) ?? 0) * 100) / 100,
      })),
      liabilities: liabState.map((l) => ({
        id: l.id,
        name: l.name,
        type: l.type,
        startingBalance: l.startingBalance,
        projectedBalance: round2f(l.balance),
        payoffMonth: l.payoffMonth,
      })),
      months: rows,
      totals,
    });
  })
);

// GET /api/summary/networth?months=12 — month-end total net worth over time.
// Transfers cancel out across accounts, so net worth = opening balances +
// cumulative (income − expense) up to each month end.
summaryRouter.get(
  "/networth",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 60);

    const labels: string[] = [];
    const cur = new Date();
    cur.setUTCDate(1);
    cur.setUTCHours(0, 0, 0, 0);
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(cur);
      d.setUTCMonth(d.getUTCMonth() - i);
      labels.push(d.toISOString().slice(0, 7));
    }

    const [accounts, liabilityRows, assetRows, conv] = await Promise.all([
      prisma.account.findMany({ where: { userId }, select: { id: true, currency: true } }),
      prisma.liability.findMany({ where: { userId }, select: { balance: true, currency: true } }),
      prisma.asset.findMany({ where: { userId }, select: { value: true, currency: true } }),
      getConversion(userId),
    ]);
    const currencyOf = new Map(accounts.map((a) => [a.id, a.currency]));
    // Liabilities and other assets have no history, so their current totals are
    // applied as a constant offset — this keeps the latest point consistent
    // with the headline net worth figure.
    const liabilitiesTotal = liabilityRows.reduce(
      (sum, l) => sum + conv.toBase(toNumber(l.balance), l.currency),
      0
    );
    const otherAssetsTotal = assetRows.reduce(
      (sum, a) => sum + conv.toBase(toNumber(a.value), a.currency),
      0
    );
    const offset = otherAssetsTotal - liabilitiesTotal;

    // Valuation- and currency-aware total net worth as of each month end.
    const result = [];
    for (const m of labels) {
      const monthEnd = new Date(monthRange(m).end.getTime() - 1); // last ms of the month
      const map = await accountBalances(userId, monthEnd);
      let total = 0;
      for (const [accId, bal] of map) total += conv.toBase(bal, currencyOf.get(accId) ?? conv.base);
      result.push({ month: m, netWorth: Math.round((total + offset) * 100) / 100 });
    }
    res.json(result);
  })
);

// GET /api/summary/isa-allowance — contributions into ISA accounts this UK tax
// year (6 Apr – 5 Apr) vs the £20,000 allowance. Contributions are counted as
// transfers from a non-ISA account into an ISA account.
summaryRouter.get(
  "/isa-allowance",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const ALLOWANCE = 20000;

    const now = new Date();
    const aprThisYear = Date.UTC(now.getUTCFullYear(), 3, 6); // 6 April (month index 3)
    const startYear = now.getTime() >= aprThisYear ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const start = new Date(Date.UTC(startYear, 3, 6, 0, 0, 0));
    const end = new Date(Date.UTC(startYear + 1, 3, 6, 0, 0, 0));

    const isaAccounts = await prisma.account.findMany({
      where: { userId, isIsa: true },
      select: { id: true, name: true },
    });
    const isaIds = new Set(isaAccounts.map((a) => a.id));

    const transfers = await prisma.transfer.findMany({
      where: { userId, date: { gte: start, lt: end } },
      select: { amount: true, fromAccountId: true, toAccountId: true },
    });
    let used = 0;
    for (const t of transfers) {
      if (isaIds.has(t.toAccountId) && !isaIds.has(t.fromAccountId)) used += toNumber(t.amount);
    }
    used = Math.round(used * 100) / 100;

    res.json({
      taxYearLabel: `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`,
      start,
      end,
      allowance: ALLOWANCE,
      used,
      remaining: Math.max(ALLOWANCE - used, 0),
      isaAccounts,
      hasIsa: isaAccounts.length > 0,
    });
  })
);

// GET /api/summary/investment-forecast?accountId=&months=120&monthlyContribution=&expectedReturn=&volatility=&target=
// Monte Carlo projection (lognormal GBM) of investment account(s). Omit accountId
// to combine all investment accounts (balance-weighted return/volatility).
summaryRouter.get(
  "/investment-forecast",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const months = Math.min(Math.max(Number(req.query.months) || 120, 1), 600);

    const allInvest = await prisma.account.findMany({
      where: { userId, isInvestment: true },
      orderBy: { createdAt: "asc" },
    });
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : "";
    const scoped = accountId ? allInvest.filter((a) => a.id === accountId) : allInvest;

    const balances = await accountBalances(userId);
    const scopedAccounts = scoped.map((a) => ({
      id: a.id,
      name: a.name,
      isIsa: a.isIsa,
      expectedReturn: toNumber(a.interestRate),
      volatility: toNumber(a.volatility),
      startingBalance: Math.round((balances.get(a.id) ?? 0) * 100) / 100,
    }));

    const startingValue = scopedAccounts.reduce((s, a) => s + a.startingBalance, 0);
    // Balance-weighted blended return/volatility (assumes correlated moves — a
    // simplification that slightly overstates combined volatility).
    const totalForWeight = scopedAccounts.reduce((s, a) => s + Math.max(a.startingBalance, 0), 0);
    const weighted = (pick: (a: (typeof scopedAccounts)[number]) => number) =>
      totalForWeight > 0
        ? scopedAccounts.reduce((s, a) => s + pick(a) * (Math.max(a.startingBalance, 0) / totalForWeight), 0)
        : scopedAccounts.length > 0
          ? scopedAccounts.reduce((s, a) => s + pick(a), 0) / scopedAccounts.length
          : 0;

    const expectedReturn =
      req.query.expectedReturn != null ? Number(req.query.expectedReturn) : weighted((a) => a.expectedReturn);
    const volatility =
      req.query.volatility != null ? Number(req.query.volatility) : weighted((a) => a.volatility);
    const monthlyContribution =
      req.query.monthlyContribution != null ? Math.max(Number(req.query.monthlyContribution), 0) : 0;
    const target = req.query.target != null ? Number(req.query.target) : null;

    const result = monteCarlo({
      startingValue,
      monthlyContribution,
      expectedReturnPct: expectedReturn,
      volatilityPct: volatility,
      months,
      target,
    });

    // Attach calendar month labels (starting next month).
    const cursor = new Date();
    cursor.setUTCDate(1);
    cursor.setUTCHours(0, 0, 0, 0);
    const monthsWithLabels = result.months.map((m) => {
      const d = new Date(cursor);
      d.setUTCMonth(d.getUTCMonth() + m.monthIndex);
      return { ...m, month: d.toISOString().slice(0, 7) };
    });

    res.json({
      accounts: scopedAccounts,
      startingValue: Math.round(startingValue * 100) / 100,
      monthlyContribution,
      expectedReturn: Math.round(expectedReturn * 1000) / 1000,
      volatility: Math.round(volatility * 1000) / 1000,
      months: monthsWithLabels,
      summary: result.summary,
      target,
    });
  })
);
