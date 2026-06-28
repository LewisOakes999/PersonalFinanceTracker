import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../lib/http.js";
import { getUserId } from "../lib/auth.js";
import { toNumber } from "../lib/serialize.js";
import { estimateIncomeTax } from "../lib/taxcalc.js";

export const taxRouter = Router();

const ISA_ALLOWANCE = 20000;
const PENSION_ALLOWANCE = 60000;
const DIVIDEND_ALLOWANCE = 500;

/** The UK tax-year (starting year) containing `now`. */
function currentTaxYearStart(now = new Date()): number {
  const aprThisYear = Date.UTC(now.getUTCFullYear(), 3, 6);
  return now.getTime() >= aprThisYear ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

const round = (n: number) => Math.round(n * 100) / 100;

// GET /api/tax/summary?year=YYYY — UK Self Assessment data for a tax year
// (6 Apr `year` – 5 Apr `year`+1). A helper to gather figures, not tax advice.
taxRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const userId = getUserId(req);
    const startYear =
      req.query.year != null && /^\d{4}$/.test(String(req.query.year))
        ? Number(req.query.year)
        : currentTaxYearStart();
    const start = new Date(Date.UTC(startYear, 3, 6, 0, 0, 0));
    const end = new Date(Date.UTC(startYear + 1, 3, 6, 0, 0, 0));

    const [txns, transfers] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId, date: { gte: start, lt: end } },
        include: { category: true, account: true },
      }),
      prisma.transfer.findMany({
        where: { userId, date: { gte: start, lt: end } },
        include: { fromAccount: true, toAccount: true },
      }),
    ]);

    // Income totalled by category.
    const incomeByCat = new Map<string, number>();
    let incomeTotal = 0;
    let taxableInterest = 0;
    let taxFreeInterest = 0;
    let dividends = 0;
    let taxFreeDividends = 0;
    let giftAid = 0;
    let nonSavingsIncome = 0; // employment / self-employment / other (excl. interest & dividends)

    for (const t of txns) {
      const amt = toNumber(t.amount);
      const tag = t.category.taxTag;
      const shelteredFromTax = t.account.isIsa || t.account.isPremiumBonds || t.account.isPension;

      if (t.type === "income") {
        incomeTotal += amt;
        incomeByCat.set(t.category.name, (incomeByCat.get(t.category.name) ?? 0) + amt);
        if (tag === "interest") {
          if (t.account.isIsa || t.account.isPremiumBonds) taxFreeInterest += amt;
          else taxableInterest += amt;
        } else if (tag === "dividend") {
          if (shelteredFromTax) taxFreeDividends += amt;
          else dividends += amt;
        } else {
          nonSavingsIncome += amt;
        }
      } else if (t.type === "expense" && tag === "giftAid") {
        giftAid += amt;
      }
    }

    const estimate = estimateIncomeTax({
      nonSavings: nonSavingsIncome,
      savingsInterest: taxableInterest,
      dividends,
    });

    // Contributions = transfers from a non-sheltered account into ISA / pension.
    let isaContributions = 0;
    let pensionContributions = 0;
    for (const tr of transfers) {
      const amt = toNumber(tr.amount);
      if (tr.toAccount.isIsa && !tr.fromAccount.isIsa) isaContributions += amt;
      if (tr.toAccount.isPension && !tr.fromAccount.isPension) pensionContributions += amt;
    }

    res.json({
      taxYearLabel: `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`,
      start,
      end,
      income: {
        total: round(incomeTotal),
        byCategory: [...incomeByCat.entries()]
          .map(([name, total]) => ({ name, total: round(total) }))
          .sort((a, b) => b.total - a.total),
      },
      interest: {
        taxable: round(taxableInterest),
        taxFree: round(taxFreeInterest),
      },
      dividends: {
        taxable: round(dividends),
        taxFree: round(taxFreeDividends),
        allowance: DIVIDEND_ALLOWANCE,
      },
      giftAid: round(giftAid),
      pension: {
        contributions: round(pensionContributions),
        allowance: PENSION_ALLOWANCE,
        remaining: round(Math.max(PENSION_ALLOWANCE - pensionContributions, 0)),
      },
      isa: {
        contributions: round(isaContributions),
        allowance: ISA_ALLOWANCE,
        remaining: round(Math.max(ISA_ALLOWANCE - isaContributions, 0)),
      },
      capitalGains: {
        tracked: false,
        note: "Capital gains aren't tracked — accurate CGT needs per-holding buy/sell prices and cost basis.",
      },
      estimate,
    });
  })
);
