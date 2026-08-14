import { CALCULATORS } from '../src/lib/finance/calculators';
import { formatMoney, formatTenure } from '../src/lib/format/money';
import { calculateLumpsum, calculateSip, calculateSwp } from '../src/lib/finance/sip';

describe('SIP', () => {
  it('matches the published annuity-due future value', () => {
    // ₹10,000/month @ 12% for 10 years -> ≈ ₹23,23,391
    const result = calculateSip({ monthlyInvestment: 10_000, annualRate: 12, years: 10 });
    expect(result.invested).toBe(1_200_000);
    expect(result.futureValue).toBeCloseTo(2_323_391, -2);
    expect(result.gain).toBeCloseTo(1_123_391, -2);
    expect(result.months).toBe(120);
  });

  it('reproduces the closed-form formula exactly when not stepping up', () => {
    const monthly = 5_000;
    const months = 36;
    const i = 0.1 / 12;
    const closedForm = monthly * ((Math.pow(1 + i, months) - 1) / i) * (1 + i);
    const result = calculateSip({ monthlyInvestment: monthly, annualRate: 10, years: 3 });
    expect(result.futureValue).toBeCloseTo(closedForm, 6);
  });

  it('invests the principal only at 0% return', () => {
    const result = calculateSip({ monthlyInvestment: 1_000, annualRate: 0, years: 2 });
    expect(result.futureValue).toBeCloseTo(24_000, 6);
    expect(result.gain).toBeCloseTo(0, 6);
  });

  it('raises the installment once a year when stepping up', () => {
    const flat = calculateSip({ monthlyInvestment: 10_000, annualRate: 12, years: 5 });
    const stepped = calculateSip({ monthlyInvestment: 10_000, annualRate: 12, years: 5, stepUpPct: 10 });
    expect(stepped.invested).toBeGreaterThan(flat.invested);
    expect(stepped.futureValue).toBeGreaterThan(flat.futureValue);
    // 4 annual hikes over a 5-year plan.
    expect(stepped.lastInstallment).toBeCloseTo(10_000 * Math.pow(1.1, 4), 6);
  });

  it('emits one row per year, with a stub row for a part year', () => {
    const result = calculateSip({ monthlyInvestment: 1_000, annualRate: 8, years: 2, months: 5 });
    expect(result.months).toBe(29);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[2]!.invested).toBeCloseTo(5_000, 6);
    expect(result.rows[2]!.cumInvested).toBeCloseTo(result.invested, 6);
    expect(result.rows[2]!.value).toBeCloseTo(result.futureValue, 6);
  });
});

describe('lumpsum', () => {
  it('compounds annually', () => {
    // 100000 x 1.12^10 = 310584.8
    const result = calculateLumpsum({ amount: 100_000, annualRate: 12, years: 10 });
    expect(result.futureValue).toBeCloseTo(310_584.8, 1);
    expect(result.absoluteReturnPct).toBeCloseTo(210.58, 1);
  });

  it('beats the same total invested via SIP over the same window', () => {
    // A lumpsum is invested for the whole term, so it must out-earn a drip of the same total.
    const lumpsum = calculateLumpsum({ amount: 1_200_000, annualRate: 12, years: 10 });
    const sip = calculateSip({ monthlyInvestment: 10_000, annualRate: 12, years: 10 });
    expect(lumpsum.futureValue).toBeGreaterThan(sip.futureValue);
  });
});

describe('SWP', () => {
  it('drains a corpus when withdrawals outpace growth', () => {
    // ₹10L at 8% grows ~₹6,667/month, so ₹10,000/month must exhaust it.
    const result = calculateSwp({ corpus: 1_000_000, monthlyWithdrawal: 10_000, annualRate: 8 });
    expect(result.sustainable).toBe(false);
    expect(result.monthsLasted).toBeGreaterThan(120);
    expect(result.monthsLasted).toBeLessThan(200);
    expect(result.finalBalance).toBeCloseTo(0, 6);
    // Withdrawals are the corpus plus everything it earned along the way.
    expect(result.totalWithdrawn).toBeCloseTo(result.corpus + result.totalGrowth, 4);
  });

  it('is sustainable when growth covers the withdrawal', () => {
    const result = calculateSwp({ corpus: 1_000_000, monthlyWithdrawal: 6_000, annualRate: 8 });
    expect(result.sustainable).toBe(true);
    expect(result.finalBalance).toBeGreaterThan(0);
  });

  it('respects an explicit horizon', () => {
    const result = calculateSwp({
      corpus: 1_000_000,
      monthlyWithdrawal: 5_000,
      annualRate: 8,
      months: 24,
    });
    expect(result.monthsLasted).toBe(24);
    expect(result.rows).toHaveLength(24);
    expect(result.totalWithdrawn).toBeCloseTo(120_000, 6);
  });

  it('withdraws after crediting that month growth', () => {
    const [first] = calculateSwp({
      corpus: 100_000,
      monthlyWithdrawal: 1_000,
      annualRate: 12,
      months: 1,
    }).rows;
    expect(first!.growth).toBeCloseTo(1_000, 6); // 100000 x 1%
    expect(first!.closing).toBeCloseTo(100_000, 6);
  });

  it('spends the whole corpus at 0% growth', () => {
    const result = calculateSwp({ corpus: 100_000, monthlyWithdrawal: 10_000, annualRate: 0 });
    expect(result.monthsLasted).toBe(10);
    expect(result.totalWithdrawn).toBeCloseTo(100_000, 6);
  });
});

describe('SWP calculator spec', () => {
  const swp = CALCULATORS.swp;
  const row = (result: ReturnType<typeof swp.compute>, label: string) =>
    result.rows.find((entry) => entry.label === label)?.value;

  it('reports totals over the stated period, not an open-ended horizon', () => {
    // Growth (8% on 50 L = 33,333/month) exceeds the 30,000 withdrawal, so this plan never runs
    // dry. It used to be projected to an arbitrary 600-month cutoff, which made "total withdrawn"
    // report 600 x 30,000 while the headline claimed the corpus lasts indefinitely.
    const result = swp.compute({ corpus: 5_000_000, withdrawal: 30_000, rate: 8, years: 10 }, 'INR');

    expect(row(result, 'Total withdrawn')).toBe(formatMoney(30_000 * 120, { currency: 'INR' }));
    expect(row(result, 'Withdrawals made')).toBe(formatTenure(120));
    expect(result.headline.label).toBe('Balance after the period');
  });

  it('scales the totals with the period', () => {
    const ten = swp.compute({ corpus: 5_000_000, withdrawal: 30_000, rate: 8, years: 10 }, 'INR');
    const twenty = swp.compute({ corpus: 5_000_000, withdrawal: 30_000, rate: 8, years: 20 }, 'INR');
    expect(row(ten, 'Total withdrawn')).not.toBe(row(twenty, 'Total withdrawn'));
    expect(row(twenty, 'Withdrawals made')).toBe(formatTenure(240));
  });

  it('says when the corpus runs out inside the period', () => {
    const result = swp.compute({ corpus: 1_000_000, withdrawal: 50_000, rate: 5, years: 20 }, 'INR');
    expect(result.headline.label).toBe('Corpus runs out after');
    // It cannot claim more months of withdrawals than the period allows.
    expect(result.headline.value).not.toBe(formatTenure(240));
  });
});
