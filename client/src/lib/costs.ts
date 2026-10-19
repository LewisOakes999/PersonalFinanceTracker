import type { FitnessSpending, Gear, Workout, WorkoutKind } from "../types";

// What training costs: the spending chosen as fitness (from Money) set against
// the workouts it paid for (from Health), month by month. Kit counts in the
// month it was bought. Pure, so it can be tested on its own.

export interface MonthCost {
  month: string; // YYYY-MM
  byCategory: number[]; // lines up with the spending's categories
  kit: number;
  total: number;
  workouts: number;
  perWorkout: number | null;
}

export interface CategoryCost {
  id: string;
  name: string;
  color: string;
  kinds: WorkoutKind[];
  /** This month so far: its spend, the workouts it paid for, and the cost of each. */
  thisMonth: { spend: number; visits: number; perVisit: number | null };
  /** Across the months it was paid for — a month without the fee isn't one it covered. */
  overall: { spend: number; visits: number; perVisit: number | null; months: number };
}

export interface TrainingCosts {
  months: MonthCost[];
  categories: CategoryCost[];
  total: { spend: number; kit: number; workouts: number; perWorkout: number | null };
}

const monthOf = (iso: string) => iso.slice(0, 7);
const per = (spend: number, n: number) => (n > 0 ? spend / n : null);
/** Does this category pay for this kind of workout? No kinds means it pays for all. */
const pays = (kinds: WorkoutKind[], kind: WorkoutKind) => kinds.length === 0 || kinds.includes(kind);

export function trainingCosts(spending: FitnessSpending, workouts: Workout[], gear: Gear[]): TrainingCosts {
  // Start from the month you began logging workouts: before that, a gym fee
  // with no workouts against it means they weren't logged, not that you didn't go.
  const firstLogged = workouts.reduce<string | null>((min, w) => (!min || w.date < min ? w.date : min), null);
  const started = firstLogged ? spending.months.filter((m) => m < monthOf(firstLogged)).length : 0;
  const data: FitnessSpending = {
    ...spending,
    months: spending.months.slice(started),
    categories: spending.categories.map((c) => ({ ...c, totals: c.totals.slice(started) })),
  };
  const index = new Map(data.months.map((m, i) => [m, i]));
  const inMonth = data.months.map(() => [] as Workout[]);
  for (const w of workouts) {
    const i = index.get(monthOf(w.date));
    if (i !== undefined) inMonth[i].push(w);
  }
  const kit = data.months.map(() => 0);
  for (const g of gear) {
    if (g.price === null || !g.boughtOn) continue;
    const i = index.get(monthOf(g.boughtOn));
    if (i !== undefined) kit[i] += g.price;
  }

  const months: MonthCost[] = data.months.map((month, i) => {
    const byCategory = data.categories.map((c) => c.totals[i] ?? 0);
    const total = byCategory.reduce((s, n) => s + n, 0) + kit[i];
    const count = inMonth[i].length;
    return { month, byCategory, kit: kit[i], total, workouts: count, perWorkout: per(total, count) };
  });

  const last = data.months.length - 1;
  const categories: CategoryCost[] = data.categories.map((c) => {
    const visits = inMonth.map((ws) => ws.filter((w) => pays(c.kinds, w.kind)).length);
    let spend = 0;
    let paidVisits = 0;
    let paidMonths = 0;
    c.totals.forEach((t, i) => {
      if (t <= 0) return;
      spend += t;
      paidVisits += visits[i];
      paidMonths++;
    });
    const nowSpend = c.totals[last] ?? 0;
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      kinds: c.kinds,
      // No fee yet this month means nothing to divide, not visits for free.
      thisMonth: { spend: nowSpend, visits: visits[last] ?? 0, perVisit: nowSpend > 0 ? per(nowSpend, visits[last] ?? 0) : null },
      overall: { spend, visits: paidVisits, perVisit: per(spend, paidVisits), months: paidMonths },
    };
  });

  const spend = months.reduce((s, m) => s + m.total, 0);
  const count = months.reduce((s, m) => s + m.workouts, 0);
  return {
    months,
    categories,
    total: { spend, kit: kit.reduce((s, n) => s + n, 0), workouts: count, perWorkout: per(spend, count) },
  };
}
