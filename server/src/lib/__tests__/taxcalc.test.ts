import { describe, it, expect } from "vitest";
import { estimateIncomeTax } from "../taxcalc";

describe("estimateIncomeTax", () => {
  it("no tax below the personal allowance", () => {
    expect(estimateIncomeTax({ nonSavings: 10000, savingsInterest: 0, dividends: 0 }).total).toBe(0);
  });

  it("basic-rate salary: 20% above the personal allowance", () => {
    // £30,000 − £12,570 = £17,430 @ 20% = £3,486
    const e = estimateIncomeTax({ nonSavings: 30000, savingsInterest: 0, dividends: 0 });
    expect(e.total).toBeCloseTo(3486, 0);
  });

  it("higher-rate salary crosses into 40%", () => {
    // £60,000: 37,700 @20% = 7,540; (60,000−12,570−37,700)=9,730 @40% = 3,892 → 11,432
    const e = estimateIncomeTax({ nonSavings: 60000, savingsInterest: 0, dividends: 0 });
    expect(e.total).toBeCloseTo(11432, 0);
  });

  it("applies the Personal Savings Allowance to interest", () => {
    // £20,000 salary (basic) + £1,000 interest → PSA £1,000 covers it, no extra tax on interest
    const noInterest = estimateIncomeTax({ nonSavings: 20000, savingsInterest: 0, dividends: 0 });
    const withInterest = estimateIncomeTax({ nonSavings: 20000, savingsInterest: 1000, dividends: 0 });
    expect(withInterest.total).toBeCloseTo(noInterest.total, 0);
  });

  it("applies the £500 dividend allowance then 8.75% in basic band", () => {
    // £20,000 salary + £1,500 dividends → (1,500−500)=1,000 @8.75% = 87.50
    const base = estimateIncomeTax({ nonSavings: 20000, savingsInterest: 0, dividends: 0 });
    const withDiv = estimateIncomeTax({ nonSavings: 20000, savingsInterest: 0, dividends: 1500 });
    expect(withDiv.dividendTax).toBeCloseTo(87.5, 1);
    expect(withDiv.total).toBeCloseTo(base.total + 87.5, 1);
  });

  it("tapers the personal allowance above £100k", () => {
    const e = estimateIncomeTax({ nonSavings: 110000, savingsInterest: 0, dividends: 0 });
    expect(e.personalAllowance).toBeCloseTo(12570 - 5000, 0); // £110k → −£5,000
  });
});
