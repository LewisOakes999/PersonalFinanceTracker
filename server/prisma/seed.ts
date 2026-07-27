import { PrismaClient, type TxnType } from "@prisma/client";
import { hashPassword } from "../src/lib/auth.js";

const prisma = new PrismaClient();

// Sample data lives under a dedicated demo account so it never leaks into the
// accounts real users create. Log in with these to explore a populated app.
const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demopass123";

// Deterministic pseudo-random so reseeding gives stable-ish data.
let seedState = 1337;
function rand(): number {
  seedState = (seedState * 1664525 + 1013904223) % 4294967296;
  return seedState / 4294967296;
}
function between(min: number, max: number): number {
  return Math.round((min + rand() * (max - min)) * 100) / 100;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

// Cool "Liquid Glass" palette (see design_handoff_liquid_glass).
const CATEGORIES: {
  name: string;
  type: TxnType;
  color: string;
  taxTag?: "interest" | "dividend" | "giftAid";
}[] = [
  { name: "Salary", type: "income", color: "#30d5c8" },
  { name: "Freelance", type: "income", color: "#5e9bff" },
  { name: "Interest", type: "income", color: "#64d2ff", taxTag: "interest" },
  { name: "Dividends", type: "income", color: "#22d3ee", taxTag: "dividend" },
  { name: "Rent", type: "expense", color: "#0a84ff" },
  { name: "Groceries", type: "expense", color: "#34e0c4" },
  { name: "Utilities", type: "expense", color: "#bf5af2" },
  { name: "Dining Out", type: "expense", color: "#5e5ce6" },
  { name: "Transport", type: "expense", color: "#30b0ff" },
  { name: "Entertainment", type: "expense", color: "#7d7aff" },
  { name: "Shopping", type: "expense", color: "#c77dff" },
  { name: "Health", type: "expense", color: "#64d2ff" },
  { name: "Charity", type: "expense", color: "#f472b6", taxTag: "giftAid" },
];

const EXPENSE_DESCRIPTIONS: Record<string, string[]> = {
  Rent: ["Monthly rent"],
  Groceries: ["Tesco", "Sainsbury's", "Aldi", "Co-op", "M&S Food"],
  Utilities: ["Electricity & gas", "Water bill", "Broadband", "Mobile"],
  "Dining Out": ["Lunch", "Coffee", "Dinner with friends", "Takeaway", "Pub"],
  Transport: ["Rail season ticket", "Fuel", "Bus fare", "Taxi"],
  Entertainment: ["Cinema", "Netflix", "Spotify", "Concert tickets"],
  Shopping: ["Amazon", "Clothing", "Homeware", "Electronics"],
  Health: ["Pharmacy", "Gym membership", "Dentist"],
};

function ym(date: Date): string {
  return date.toISOString().slice(0, 7);
}

async function main() {
  // Create (or reuse) the demo user, then reset only ITS data.
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash: hashPassword(DEMO_PASSWORD) },
  });
  const userId = user.id;

  console.log("Resetting demo user data...");
  // Delete in FK-safe order: dependents before the accounts/categories they reference.
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.transfer.deleteMany({ where: { userId } });
  await prisma.accountValuation.deleteMany({ where: { userId } });
  await prisma.recurringTransaction.deleteMany({ where: { userId } });
  await prisma.recurringTransfer.deleteMany({ where: { userId } });
  await prisma.exchangeRate.deleteMany({ where: { userId } });
  await prisma.budget.deleteMany({ where: { userId } });
  await prisma.goal.deleteMany({ where: { userId } });
  await prisma.categoryRule.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId } });
  await prisma.liability.deleteMany({ where: { userId } });
  await prisma.asset.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.settings.deleteMany({ where: { userId } });

  await prisma.settings.create({ data: { userId, currency: "GBP" } });

  console.log("Creating accounts...");
  const current = await prisma.account.create({
    data: {
      userId, name: "Everyday Current", type: "current", currency: "GBP",
      openingBalance: 2400, interestRate: 0.5,
    },
  });
  const savings = await prisma.account.create({
    data: {
      userId, name: "Cash ISA", type: "savings", currency: "GBP",
      openingBalance: 8200, isIsa: true, interestRate: 4.75,
      // 1-year fixed ISA; interest paid at maturity.
      termStart: new Date("2026-03-01"), maturityDate: new Date("2027-03-01"), interestPaid: "maturity",
    },
  });
  const credit = await prisma.account.create({
    data: {
      userId, name: "Rewards Credit Card", type: "credit", currency: "GBP",
      openingBalance: -650, interestRate: 0,
    },
  });
  await prisma.account.create({
    data: {
      userId, name: "NS&I Premium Bonds", type: "savings", currency: "GBP",
      openingBalance: 5000, isPremiumBonds: true, interestRate: 4.0,
    },
  });
  const sAndSIsa = await prisma.account.create({
    data: {
      userId, name: "Stocks & Shares ISA", type: "investment", currency: "GBP",
      openingBalance: 12000, isIsa: true, isInvestment: true,
      interestRate: 7.5, volatility: 16.0, // "Global shares" risk profile
    },
  });
  const taxSavings = await prisma.account.create({
    data: {
      userId, name: "Savings Account", type: "savings", currency: "GBP",
      openingBalance: 6000, interestRate: 4.2, // taxable interest (not an ISA)
    },
  });
  const pension = await prisma.account.create({
    data: {
      userId, name: "Workplace Pension", type: "pension", currency: "GBP",
      openingBalance: 28000, isPension: true, isInvestment: true,
      interestRate: 6.0, volatility: 12.0, // "Balanced"-ish growth
    },
  });

  console.log("Creating liabilities...");
  await prisma.liability.createMany({
    data: [
      { userId, name: "Home Mortgage", type: "mortgage", balance: 184500, interestRate: 4.29, monthlyPayment: 1150 },
      { userId, name: "Car Lease", type: "lease", balance: 9200, interestRate: 6.9, monthlyPayment: 289 },
      { userId, name: "Student Loan", type: "loan", balance: 21400, interestRate: 7.3, monthlyPayment: 95 },
    ],
  });

  console.log("Creating other assets...");
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
  await prisma.asset.createMany({
    data: [
      // Property isn't depreciated — its value tracks the market instead.
      { userId, name: "Home", type: "property", value: 315000 },
      // A car bought two years ago, written down at the vehicle rate.
      {
        userId,
        name: "Car (VW Golf)",
        type: "vehicle",
        value: 14500,
        depreciates: true,
        valueDate: twoYearsAgo,
      },
    ],
  });

  console.log("Creating categories...");
  const categories: Record<string, { id: string }> = {};
  for (const c of CATEGORIES) {
    categories[c.name] = await prisma.category.create({ data: { ...c, userId } });
  }

  await prisma.categoryRule.createMany({
    data: [
      { userId, match: "tesco", categoryId: categories["Groceries"].id },
      { userId, match: "aldi", categoryId: categories["Groceries"].id },
      { userId, match: "spotify", categoryId: categories["Entertainment"].id },
      { userId, match: "uber", categoryId: categories["Transport"].id },
    ],
  });

  console.log("Creating transactions...");
  const now = new Date();
  const MONTHS = 6;
  const txns: {
    userId: string;
    date: Date;
    amount: number;
    type: TxnType;
    categoryId: string;
    accountId: string;
    description: string;
  }[] = [];

  for (let m = MONTHS - 1; m >= 0; m--) {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth();

    // --- Income ---
    txns.push({
      userId,
      date: new Date(Date.UTC(year, month, 25)),
      amount: between(3100, 3300),
      type: "income",
      categoryId: categories["Salary"].id,
      accountId: current.id,
      description: "Monthly salary",
    });
    if (rand() > 0.5) {
      txns.push({
        userId,
        date: new Date(Date.UTC(year, month, 12)),
        amount: between(250, 900),
        type: "income",
        categoryId: categories["Freelance"].id,
        accountId: current.id,
        description: "Freelance project",
      });
    }
    txns.push({
      userId,
      date: new Date(Date.UTC(year, month, 1)),
      amount: between(12, 28),
      type: "income",
      categoryId: categories["Interest"].id,
      accountId: taxSavings.id, // taxable savings interest (not an ISA)
      description: "Savings interest",
    });
    // Quarterly dividends from a non-ISA holding (taxable).
    if (month % 3 === 0) {
      txns.push({
        userId,
        date: new Date(Date.UTC(year, month, 8)),
        amount: between(40, 90),
        type: "income",
        categoryId: categories["Dividends"].id,
        accountId: current.id,
        description: "Share dividend",
      });
    }
    // Monthly Gift-Aided charity donation.
    txns.push({
      userId,
      date: new Date(Date.UTC(year, month, 18)),
      amount: between(10, 30),
      type: "expense",
      categoryId: categories["Charity"].id,
      accountId: current.id,
      description: "Charity donation (Gift Aid)",
    });

    // --- Fixed expenses ---
    txns.push({
      userId,
      date: new Date(Date.UTC(year, month, 1)),
      amount: 1250,
      type: "expense",
      categoryId: categories["Rent"].id,
      accountId: current.id,
      description: "Monthly rent",
    });
    for (const util of EXPENSE_DESCRIPTIONS["Utilities"]) {
      txns.push({
        userId,
        date: new Date(Date.UTC(year, month, 5 + Math.floor(rand() * 10))),
        amount: between(25, 95),
        type: "expense",
        categoryId: categories["Utilities"].id,
        accountId: current.id,
        description: util,
      });
    }

    // --- Variable expenses ---
    const variableCats = ["Groceries", "Dining Out", "Transport", "Entertainment", "Shopping", "Health"];
    const count = 18 + Math.floor(rand() * 14);
    for (let i = 0; i < count; i++) {
      const catName = pick(variableCats);
      const day = 1 + Math.floor(rand() * 27);
      const ranges: Record<string, [number, number]> = {
        Groceries: [18, 85],
        "Dining Out": [6, 55],
        Transport: [3, 160],
        Entertainment: [8, 60],
        Shopping: [12, 220],
        Health: [10, 80],
      };
      const [lo, hi] = ranges[catName];
      txns.push({
        userId,
        date: new Date(Date.UTC(year, month, day)),
        amount: between(lo, hi),
        type: "expense",
        categoryId: categories[catName].id,
        accountId: rand() > 0.4 ? credit.id : current.id,
        description: pick(EXPENSE_DESCRIPTIONS[catName]),
      });
    }
  }

  await prisma.transaction.createMany({ data: txns });

  console.log("Creating transfers (monthly savings)...");
  const transfers: {
    userId: string;
    date: Date;
    amount: number;
    fromAccountId: string;
    toAccountId: string;
    note: string;
  }[] = [];
  for (let m = MONTHS - 1; m >= 0; m--) {
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    transfers.push({
      userId,
      date: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 26)),
      amount: 250,
      fromAccountId: current.id,
      toAccountId: savings.id,
      note: "Monthly transfer to ISA",
    });
    transfers.push({
      userId,
      date: new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 28)),
      amount: 300,
      fromAccountId: current.id,
      toAccountId: pension.id,
      note: "Monthly pension contribution",
    });
  }
  await prisma.transfer.createMany({ data: transfers });

  console.log("Creating budgets for the last 3 months...");
  const budgetTargets: Record<string, number> = {
    Groceries: 400,
    "Dining Out": 200,
    Transport: 220,
    Entertainment: 120,
    Shopping: 250,
    Health: 100,
    Utilities: 220,
  };
  for (let m = 0; m < 3; m++) {
    const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    for (const [name, amount] of Object.entries(budgetTargets)) {
      await prisma.budget.create({
        data: { userId, categoryId: categories[name].id, month: ym(monthDate), amount },
      });
    }
  }

  console.log("Creating account valuations (mark-to-market)...");
  await prisma.accountValuation.create({
    data: {
      userId,
      accountId: sAndSIsa.id,
      date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      value: 13850, // current market value vs £12,000 invested
      note: "Platform valuation",
    },
  });

  console.log("Creating recurring rules...");
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  await prisma.recurringTransaction.createMany({
    data: [
      {
        userId,
        type: "income",
        amount: 3200,
        description: "Monthly salary",
        categoryId: categories["Salary"].id,
        accountId: current.id,
        frequency: "monthly",
        nextDate: new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 25)),
      },
      {
        userId,
        type: "expense",
        amount: 12.99,
        description: "Netflix",
        categoryId: categories["Entertainment"].id,
        accountId: current.id,
        frequency: "monthly",
        nextDate: new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 15)),
      },
    ],
  });

  console.log("Creating recurring transfer...");
  await prisma.recurringTransfer.create({
    data: {
      userId,
      amount: 300,
      fromAccountId: current.id,
      toAccountId: pension.id,
      frequency: "monthly",
      nextDate: new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 28)),
      note: "Monthly pension top-up",
    },
  });

  console.log("Creating savings goals...");
  await prisma.goal.createMany({
    data: [
      { userId, name: "Emergency Fund", targetAmount: 10000, accountId: savings.id },
      { userId, name: "New Car", targetAmount: 15000, savedAmount: 4200 },
      {
        userId,
        name: "Holiday 2027",
        targetAmount: 2500,
        savedAmount: 800,
        targetDate: new Date(Date.UTC(now.getUTCFullYear() + 1, 6, 1)),
      },
    ],
  });

  console.log(
    `Seed complete: ${txns.length} transactions for demo user "${DEMO_EMAIL}" (password: ${DEMO_PASSWORD}).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
