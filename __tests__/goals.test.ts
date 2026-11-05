import { CALCULATORS, CALCULATOR_IDS } from '../src/lib/finance/calculators';
import {
  calculateGoalSip,
  calculateNps,
  calculateRetirement,
  calculateSsy,
  SSY_MAX_DEPOSIT,
} from '../src/lib/finance/goals';
import { calculateSip } from '../src/lib/finance/sip';
import { calculateStepUpEmi } from '../src/lib/finance/step-up';
import { amortize } from '../src/lib/finance/emi';
import { calculateHra } from '../src/lib/finance/tax';

describe('calculateGoalSip', () => {
  it('finds the SIP that grows exactly to the goal', () => {
    const result = calculateGoalSip({ targetToday: 2_000_000, years: 8, annualRate: 12 });
    const check = calculateSip({ monthlyInvestment: result.monthlySip, annualRate: 12, years: 8 });
    expect(check.futureValue).toBeCloseTo(2_000_000, 2);
    expect(result.targetFuture).toBe(2_000_000);
  });

  it('inflates the goal and counts what is already saved', () => {
    const result = calculateGoalSip({ targetToday: 1_000_000, years: 10, annualRate: 10, inflationPct: 6, savedNow: 100_000 });
    expect(result.targetFuture).toBeCloseTo(1_000_000 * 1.06 ** 10, 4);
    expect(result.savedFuture).toBeCloseTo(100_000 * 1.1 ** 10, 4);
    const sip = calculateSip({ monthlyInvestment: result.monthlySip, annualRate: 10, years: 10 });
    expect(sip.futureValue + result.savedFuture).toBeCloseTo(result.targetFuture, 2);
    expect(result.rows[result.rows.length - 1]!.value).toBeCloseTo(result.targetFuture, 2);
  });

  it('needs no SIP when savings already cover the goal', () => {
    expect(calculateGoalSip({ targetToday: 100_000, years: 5, annualRate: 10, savedNow: 100_000 }).monthlySip).toBe(0);
  });
});

describe('calculateRetirement', () => {
  it('with no inflation and no return, needs every month of expenses', () => {
    const result = calculateRetirement({
      currentAge: 30,
      retireAge: 60,
      lifeExpectancy: 85,
      monthlyExpense: 50_000,
      inflationPct: 0,
      preReturn: 12,
      postReturn: 0,
    });
    expect(result.yearsInRetirement).toBe(25);
    expect(result.corpusNeeded).toBeCloseTo(50_000 * 12 * 25, 4);
    expect(result.rows[result.rows.length - 1]!.age).toBe(60);
  });

  it('grows expenses with inflation until retirement', () => {
    const result = calculateRetirement({
      currentAge: 35,
      retireAge: 60,
      lifeExpectancy: 85,
      monthlyExpense: 40_000,
      inflationPct: 6,
      preReturn: 12,
      postReturn: 7,
    });
    expect(result.expenseAtRetirement).toBeCloseTo(40_000 * 1.06 ** 25, 4);
    expect(result.corpusNeeded).toBeGreaterThan(result.expenseAtRetirement * 12 * 15);
    expect(result.monthlySip).toBeGreaterThan(0);
  });
});

describe('calculateNps', () => {
  it('splits the corpus into the lump sum and the annuity', () => {
    const result = calculateNps({ monthly: 5_000, currentAge: 30, annualRate: 10, annuityPct: 20, annuityRate: 6 });
    expect(result.years).toBe(30);
    // The annuity share cannot go below 40%.
    expect(result.annuityCorpus).toBeCloseTo(result.corpus * 0.4, 4);
    expect(result.lumpSum + result.annuityCorpus).toBeCloseTo(result.corpus, 4);
    expect(result.monthlyPension).toBeCloseTo((result.annuityCorpus * 0.06) / 12, 4);
  });
});

describe('calculateSsy', () => {
  it('deposits for 15 years and matures after 21', () => {
    const r = 0.082;
    const result = calculateSsy({ yearly: 150_000, annualRate: 8.2, girlAge: 2 });
    expect(result.rows).toHaveLength(21);
    expect(result.invested).toBe(2_250_000);
    expect(result.rows[15]!.deposited).toBe(0);
    expect(result.maturityAge).toBe(23);
    const closed = 150_000 * (((1 + r) ** 15 - 1) / r) * (1 + r) * (1 + r) ** 6;
    expect(result.maturity).toBeCloseTo(closed, 2);
  });

  it('caps the deposit at 1.5 lakh', () => {
    expect(calculateSsy({ yearly: 500_000, annualRate: 8, girlAge: 0 }).invested).toBe(SSY_MAX_DEPOSIT * 15);
  });
});

describe('calculateHra', () => {
  it('exempts the lowest of the three limits', () => {
    const result = calculateHra({ basicDa: 600_000, hraReceived: 240_000, rentPaid: 216_000, metro: true });
    expect(result.limits).toEqual({ received: 240_000, rentOverTenPct: 156_000, salaryShare: 300_000 });
    expect(result.exempt).toBe(156_000);
    expect(result.taxable).toBe(84_000);
    expect(result.binding).toBe('rentOverTenPct');
  });

  it('uses 40% outside the metros and exempts nothing with no rent', () => {
    expect(calculateHra({ basicDa: 600_000, hraReceived: 400_000, rentPaid: 600_000, metro: false }).exempt).toBe(240_000);
    expect(calculateHra({ basicDa: 600_000, hraReceived: 240_000, rentPaid: 0, metro: true }).exempt).toBe(0);
  });
});

describe('calculateStepUpEmi', () => {
  it('matches the flat schedule with no step-up', () => {
    const result = calculateStepUpEmi({ principal: 2_000_000, annualRate: 9, tenureMonths: 120, stepUpPct: 0 });
    const flat = amortize({ principal: 2_000_000, annualRate: 9, tenureMonths: 120 });
    expect(result.months).toBe(120);
    expect(result.totalInterest).toBeCloseTo(flat.totalInterest, 2);
    expect(result.interestSaved).toBeCloseTo(0, 2);
  });

  it('closes early and repays exactly the principal with a step-up', () => {
    const result = calculateStepUpEmi({ principal: 5_000_000, annualRate: 8.5, tenureMonths: 240, stepUpPct: 5 });
    expect(result.months).toBeLessThan(240);
    expect(result.interestSaved).toBeGreaterThan(0);
    expect(result.finalEmi).toBeGreaterThan(result.startEmi);
    const repaid = result.years.reduce((sum, y) => sum + y.principal, 0);
    expect(repaid).toBeCloseTo(5_000_000, 1);
    expect(result.years[result.years.length - 1]!.closing).toBe(0);
  });
});

describe('registry', () => {
  it('computes every calculator from its defaults without NaN', () => {
    for (const id of CALCULATOR_IDS) {
      const spec = CALCULATORS[id];
      const result = spec.compute(spec.defaults, 'INR');
      expect(result.headline.value).not.toMatch(/NaN|Infinity/);
      expect(Number.isFinite(result.invested + result.gain)).toBe(true);
    }
  });
});
