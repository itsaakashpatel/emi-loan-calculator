import { calculateEligibility } from '../src/lib/finance/emi';
import { calculateAffordability, calculateRefinance } from '../src/lib/finance/loan-tools';

describe('calculateAffordability', () => {
  // A clean, hand-checkable example: 0% interest makes the annuity factor exactly the tenure,
  // so the loan amount is just (eligible EMI x months).
  const WORKED_EXAMPLE = {
    monthlyIncome: 100_000,
    foirPct: 50,
    existingEmis: 0,
    annualRate: 0,
    tenureMonths: 12,
    downPayment: 500_000,
  };

  it('matches a worked example by hand', () => {
    const result = calculateAffordability(WORKED_EXAMPLE);
    // EMI ceiling = 100,000 x 50% = 50,000; no existing EMIs, so eligible EMI is the same.
    expect(result.emiCeiling).toBe(50_000);
    expect(result.eligibleEmi).toBe(50_000);
    // At 0% over 12 months, loan amount = EMI x n = 50,000 x 12 = 600,000.
    expect(result.loanAmount).toBe(600_000);
    // Affordable price = loan amount + down payment = 600,000 + 500,000.
    expect(result.affordablePrice).toBe(1_100_000);
  });

  it('adds the down payment straight onto the loan amount', () => {
    const noDown = calculateAffordability({ ...WORKED_EXAMPLE, downPayment: 0 });
    const withDown = calculateAffordability({ ...WORKED_EXAMPLE, downPayment: 250_000 });
    expect(withDown.loanAmount).toBe(noDown.loanAmount);
    expect(withDown.affordablePrice - noDown.affordablePrice).toBe(250_000);
  });

  it('equals plain eligibility when the down payment is zero', () => {
    const eligibility = calculateEligibility({
      monthlyIncome: WORKED_EXAMPLE.monthlyIncome,
      foirPct: WORKED_EXAMPLE.foirPct,
      existingEmis: WORKED_EXAMPLE.existingEmis,
      annualRate: WORKED_EXAMPLE.annualRate,
      tenureMonths: WORKED_EXAMPLE.tenureMonths,
    });
    const result = calculateAffordability({ ...WORKED_EXAMPLE, downPayment: 0 });
    expect(result.eligibleEmi).toBe(eligibility.eligibleEmi);
    expect(result.loanAmount).toBe(eligibility.eligibleAmount);
    expect(result.affordablePrice).toBe(eligibility.eligibleAmount);
  });

  it('floors at 0 — never negative — when existing EMIs are at or above the ceiling', () => {
    const atCeiling = calculateAffordability({ ...WORKED_EXAMPLE, existingEmis: 50_000 });
    expect(atCeiling.eligibleEmi).toBe(0);
    expect(atCeiling.loanAmount).toBe(0);
    expect(atCeiling.affordablePrice).toBe(WORKED_EXAMPLE.downPayment);

    const aboveCeiling = calculateAffordability({ ...WORKED_EXAMPLE, existingEmis: 90_000 });
    expect(aboveCeiling.eligibleEmi).toBe(0);
    expect(aboveCeiling.loanAmount).toBe(0);
    expect(aboveCeiling.affordablePrice).toBe(WORKED_EXAMPLE.downPayment);
  });
});

describe('calculateRefinance', () => {
  const BASE = {
    outstandingPrincipal: 1_000_000,
    existingAnnualRate: 12,
    existingTenureMonths: 120,
    newAnnualRate: 8,
    newTenureMonths: 120,
    switchingCost: 0,
  };

  it('saves money and reports worthIt when the new rate is clearly lower', () => {
    const result = calculateRefinance(BASE);
    expect(result.newLoan.emi).toBeLessThan(result.existingLoan.emi);
    expect(result.newLoan.totalInterest).toBeLessThan(result.existingLoan.totalInterest);
    expect(result.grossSaving).toBeGreaterThan(0);
    expect(result.netSaving).toBe(result.grossSaving);
    expect(result.worthIt).toBe(true);
  });

  it('shows no saving at an equal rate, and a switching cost flips worthIt to false', () => {
    const equalRate = { ...BASE, newAnnualRate: BASE.existingAnnualRate };
    const noCost = calculateRefinance(equalRate);
    expect(noCost.newLoan.emi).toBeCloseTo(noCost.existingLoan.emi, 6);
    expect(noCost.grossSaving).toBeCloseTo(0, 6);
    expect(noCost.worthIt).toBe(false);

    const withCost = calculateRefinance({ ...equalRate, switchingCost: 10_000 });
    expect(withCost.netSaving).toBeCloseTo(-10_000, 6);
    expect(withCost.worthIt).toBe(false);
  });

  it('costs more when the new rate is higher', () => {
    const higherRate = { ...BASE, newAnnualRate: 14 };
    const result = calculateRefinance(higherRate);
    expect(result.newLoan.totalInterest).toBeGreaterThan(result.existingLoan.totalInterest);
    expect(result.grossSaving).toBeLessThan(0);
    expect(result.netSaving).toBeLessThan(0);
    expect(result.worthIt).toBe(false);
  });

  it('subtracts the switching cost from the gross saving to get the net saving', () => {
    const withCost = calculateRefinance({ ...BASE, switchingCost: 50_000 });
    const withoutCost = calculateRefinance(BASE);
    expect(withCost.grossSaving).toBeCloseTo(withoutCost.grossSaving, 6);
    expect(withCost.netSaving).toBeCloseTo(withCost.grossSaving - 50_000, 6);
  });

  it('flags the trap: extending the tenure at a lower rate can still raise total interest', () => {
    // Lower new rate (8% vs 12%) but stretched from 5 remaining years to 25 — the classic
    // "lower EMI, higher lifetime cost" trap a refinance calculator has to catch.
    const trap = calculateRefinance({
      outstandingPrincipal: 1_000_000,
      existingAnnualRate: 12,
      existingTenureMonths: 60,
      newAnnualRate: 8,
      newTenureMonths: 300,
      switchingCost: 0,
    });
    expect(trap.newLoan.emi).toBeLessThan(trap.existingLoan.emi);
    expect(trap.newLoan.totalInterest).toBeGreaterThan(trap.existingLoan.totalInterest);
    expect(trap.grossSaving).toBeLessThan(0);
    expect(trap.worthIt).toBe(false);
  });

  it('gives the same EMI on both sides when rate and tenure are unchanged', () => {
    const result = calculateRefinance({ ...BASE, newAnnualRate: BASE.existingAnnualRate, newTenureMonths: BASE.existingTenureMonths });
    expect(result.newLoan.emi).toBeCloseTo(result.existingLoan.emi, 6);
    expect(result.newLoan.totalInterest).toBeCloseTo(result.existingLoan.totalInterest, 6);
  });

  it('defaults the switching cost to 0 when omitted', () => {
    const { switchingCost, ...withoutCost } = BASE;
    const result = calculateRefinance(withoutCost);
    expect(result.switchingCost).toBe(0);
    expect(result.netSaving).toBe(result.grossSaving);
  });
});
