import {
  PPF_DEFAULT_RATE,
  calculateFd,
  calculatePpf,
  calculateRd,
  fdValueAt,
  rdValueAfter,
} from '../src/lib/finance/deposits';
import {
  calculateCompoundInterest,
  calculateSimpleInterest,
} from '../src/lib/finance/interest';

describe('fixed deposit', () => {
  it('compounds quarterly by default', () => {
    // ₹1,00,000 @ 7% for 5 years, quarterly: 100000 x (1.0175)^20 ≈ ₹1,41,478
    const result = calculateFd({ principal: 100_000, annualRate: 7, years: 5 });
    expect(result.maturity).toBeCloseTo(141_478, -1);
    expect(result.interest).toBeCloseTo(41_478, -1);
    expect(result.termMonths).toBe(60);
    expect(result.totalReturnPct).toBeCloseTo(41.478, 1);
  });

  it('orders maturity by compounding frequency', () => {
    const base = { principal: 100_000, annualRate: 7, years: 5 } as const;
    const simple = calculateFd({ ...base, compounding: 'simple' }).maturity;
    const yearly = calculateFd({ ...base, compounding: 'yearly' }).maturity;
    const quarterly = calculateFd({ ...base, compounding: 'quarterly' }).maturity;
    const monthly = calculateFd({ ...base, compounding: 'monthly' }).maturity;
    expect(simple).toBeLessThan(yearly);
    expect(yearly).toBeLessThan(quarterly);
    expect(quarterly).toBeLessThan(monthly);
    expect(simple).toBeCloseTo(135_000, 6); // 100000 x (1 + 0.07 x 5)
  });

  it('handles part-year terms', () => {
    const result = calculateFd({ principal: 100_000, annualRate: 7, years: 1, months: 6 });
    expect(result.termMonths).toBe(18);
    expect(result.maturity).toBeCloseTo(fdValueAt(100_000, 7, 1.5, 'quarterly'), 6);
    // The final row is a stub, so yearly rows cover 2 calendar years.
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]!.closing).toBeCloseTo(result.maturity, 6);
  });

  it('yearly rows chain from opening to closing', () => {
    const { rows, principal, maturity } = calculateFd({ principal: 50_000, annualRate: 6.5, years: 4 });
    expect(rows[0]!.opening).toBe(principal);
    expect(rows[rows.length - 1]!.closing).toBeCloseTo(maturity, 6);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.opening).toBeCloseTo(rows[i - 1]!.closing, 6);
    }
  });
});

describe('recurring deposit', () => {
  it('compounds each installment for the months it stays invested', () => {
    // ₹5,000/month @ 7% for 12 months, quarterly compounding -> ≈ ₹62,313
    const result = calculateRd({ monthlyDeposit: 5_000, annualRate: 7, months: 12 });
    expect(result.invested).toBe(60_000);
    expect(result.maturity).toBeCloseTo(62_313, -1);
    expect(result.interest).toBeCloseTo(2_313, -1);
  });

  it('earns nothing at 0%', () => {
    const result = calculateRd({ monthlyDeposit: 1_000, annualRate: 0, months: 24 });
    expect(result.maturity).toBeCloseTo(24_000, 6);
    expect(result.interest).toBeCloseTo(0, 6);
  });

  it('grows with the term', () => {
    const short = rdValueAfter(5_000, 7, 12);
    const long = rdValueAfter(5_000, 7, 60);
    expect(long).toBeGreaterThan(short * 5); // compounding beats the linear deposit growth
  });

  it('yearly rows account for every rupee deposited', () => {
    const { rows, invested, maturity } = calculateRd({ monthlyDeposit: 2_000, annualRate: 7, months: 30 });
    expect(rows).toHaveLength(3);
    const deposited = rows.reduce((sum, r) => sum + r.deposited, 0);
    expect(deposited).toBeCloseTo(invested, 6);
    expect(rows[rows.length - 1]!.closing).toBeCloseTo(maturity, 6);
  });
});

describe('PPF', () => {
  it('matches the published 15-year maturity at the default rate', () => {
    // ₹1,50,000/year @ 7.1% for 15 years -> ₹40,68,209 (the figure PPF calculators publish)
    const result = calculatePpf({ yearlyDeposit: 150_000, annualRate: PPF_DEFAULT_RATE, years: 15 });
    expect(result.invested).toBe(2_250_000);
    expect(result.maturity).toBeCloseTo(4_068_209, 0);
    expect(result.rows).toHaveLength(15);
  });

  it('credits interest on the deposit in its first year (annuity-due)', () => {
    const { rows } = calculatePpf({ yearlyDeposit: 100_000, annualRate: 10, years: 2 });
    expect(rows[0]!.interest).toBeCloseTo(10_000, 6);
    expect(rows[0]!.closing).toBeCloseTo(110_000, 6);
    expect(rows[1]!.interest).toBeCloseTo(21_000, 6); // (110000 + 100000) x 10%
    expect(rows[1]!.closing).toBeCloseTo(231_000, 6);
  });

  it('grows with a 5-year extension block', () => {
    const base = calculatePpf({ yearlyDeposit: 150_000, annualRate: 7.1, years: 15 });
    const extended = calculatePpf({ yearlyDeposit: 150_000, annualRate: 7.1, years: 20 });
    expect(extended.maturity).toBeGreaterThan(base.maturity);
    expect(extended.rows).toHaveLength(20);
  });
});

describe('simple interest', () => {
  it('does not compound', () => {
    const result = calculateSimpleInterest({ principal: 100_000, annualRate: 10, years: 5 });
    expect(result.interest).toBeCloseTo(50_000, 6);
    expect(result.total).toBeCloseTo(150_000, 6);
    // Equal interest every year.
    for (const row of result.rows) expect(row.interest).toBeCloseTo(10_000, 6);
  });

  it('prorates part years', () => {
    const result = calculateSimpleInterest({ principal: 100_000, annualRate: 12, years: 0, months: 6 });
    expect(result.interest).toBeCloseTo(6_000, 6);
  });
});

describe('compound interest', () => {
  it('matches the textbook yearly case', () => {
    // 100000 x 1.1^5 = 161051
    const result = calculateCompoundInterest({ principal: 100_000, annualRate: 10, years: 5 });
    expect(result.total).toBeCloseTo(161_051, 6);
    expect(result.interest).toBeCloseTo(61_051, 6);
    expect(result.effectiveAnnualRatePct).toBeCloseTo(10, 6);
  });

  it('reports a higher effective rate for intra-year compounding', () => {
    const monthly = calculateCompoundInterest({
      principal: 100_000,
      annualRate: 12,
      years: 1,
      compounding: 'monthly',
    });
    expect(monthly.effectiveAnnualRatePct).toBeCloseTo(12.6825, 3);
    expect(monthly.total).toBeCloseTo(112_682.5, 1);
  });

  it('beats simple interest over the same term', () => {
    const args = { principal: 100_000, annualRate: 10, years: 5 } as const;
    expect(calculateCompoundInterest(args).total).toBeGreaterThan(calculateSimpleInterest(args).total);
  });
});
