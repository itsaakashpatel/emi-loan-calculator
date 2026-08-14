import { computeEmi } from '../src/lib/finance/emi';
import { computeEmiBy, computeFlatEmi, reviseLoan } from '../src/lib/finance/revise';

describe('computeFlatEmi', () => {
  it('charges interest on the original amount for the whole term', () => {
    // 1,00,000 at 10% flat for 2 years: interest is 20,000 regardless of repayment.
    const result = computeFlatEmi(100_000, 10, 24);
    expect(result.totalInterest).toBeCloseTo(20_000, 6);
    expect(result.totalPayment).toBeCloseTo(120_000, 6);
    expect(result.emi).toBeCloseTo(5_000, 6);
  });

  it('costs more than the same rate on a reducing balance', () => {
    const flat = computeFlatEmi(100_000, 10, 24);
    const reducing = computeEmi(100_000, 10, 24);
    expect(flat.emi).toBeGreaterThan(reducing);
  });

  it('reports the reducing rate that costs the same, which is far higher', () => {
    // The standard result: a flat rate maps to roughly double on a reducing balance.
    const result = computeFlatEmi(100_000, 10, 24);
    expect(result.equivalentReducingRate).not.toBeNull();
    expect(result.equivalentReducingRate!).toBeGreaterThan(17);
    expect(result.equivalentReducingRate!).toBeLessThan(20);
  });

  it('is zero for a zero principal or term', () => {
    expect(computeFlatEmi(0, 10, 24).emi).toBe(0);
    expect(computeFlatEmi(100_000, 10, 0).emi).toBe(0);
    expect(computeFlatEmi(0, 10, 24).equivalentReducingRate).toBeNull();
  });

  it('charges no interest at a zero rate', () => {
    const result = computeFlatEmi(120_000, 0, 24);
    expect(result.totalInterest).toBe(0);
    expect(result.emi).toBeCloseTo(5_000, 6);
  });
});

describe('computeEmiBy', () => {
  it('dispatches to the right method', () => {
    expect(computeEmiBy('reducing', 100_000, 10, 24)).toBeCloseTo(computeEmi(100_000, 10, 24), 6);
    expect(computeEmiBy('flat', 100_000, 10, 24)).toBeCloseTo(5_000, 6);
  });
});

describe('reviseLoan', () => {
  const running = { outstanding: 1_000_000, currentAnnualRate: 9, currentEmi: 12_000 };

  it('derives the months left from the outstanding balance, rate and EMI', () => {
    const result = reviseLoan(running);
    expect(result.current).not.toBeNull();
    // Closed form: n = -ln(1 - P.r/E) / ln(1+r) = -ln(0.375)/ln(1.0075) = 131.3 -> 132 months.
    expect(result.current!.tenureMonths).toBe(132);
  });

  it('returns no current position when the EMI cannot cover the interest', () => {
    const result = reviseLoan({ outstanding: 1_000_000, currentAnnualRate: 12, currentEmi: 5_000 });
    expect(result.current).toBeNull();
  });

  it('shortens the loan when a lump sum is paid and the EMI is kept', () => {
    const result = reviseLoan({ ...running, prepayment: 200_000 });
    expect(result.monthsSaved).toBeGreaterThan(0);
    expect(result.keepEmi!.tenureMonths).toBeLessThan(result.current!.tenureMonths);
    expect(result.interestSavedKeepingEmi).toBeGreaterThan(0);
    expect(result.balanceAfterPrepayment).toBe(800_000);
  });

  it('lowers the instalment when the finish date is kept instead', () => {
    const result = reviseLoan({ ...running, prepayment: 200_000 });
    expect(result.emiReduction).toBeGreaterThan(0);
    expect(result.keepTenure!.emi).toBeLessThan(running.currentEmi);
    expect(result.keepTenure!.tenureMonths).toBeLessThanOrEqual(result.current!.tenureMonths);
  });

  it('saves more interest by keeping the EMI than by keeping the tenure', () => {
    // This is the whole point of showing both, so it is worth pinning down.
    const result = reviseLoan({ ...running, prepayment: 200_000 });
    expect(result.interestSavedKeepingEmi).toBeGreaterThan(result.interestSavedKeepingTenure);
  });

  it('never prepays more than the balance', () => {
    const result = reviseLoan({ ...running, prepayment: 5_000_000 });
    expect(result.balanceAfterPrepayment).toBe(0);
    expect(result.keepEmi!.tenureMonths).toBe(0);
  });

  it('recomputes against a revised rate', () => {
    const cheaper = reviseLoan({ ...running, revisedAnnualRate: 7 });
    const dearer = reviseLoan({ ...running, revisedAnnualRate: 11 });
    const unchanged = reviseLoan(running);
    // The same EMI against a lower rate clears the balance sooner.
    expect(cheaper.keepEmi!.tenureMonths).toBeLessThan(unchanged.current!.tenureMonths);
    expect(cheaper.interestSavedKeepingEmi).toBeGreaterThan(0);
    // A higher rate costs more, so the "saving" is negative and the loan runs longer.
    expect(dearer.interestSavedKeepingEmi).toBeLessThan(0);
    expect(dearer.keepEmi!.tenureMonths).toBeGreaterThan(cheaper.keepEmi!.tenureMonths);
  });

  it('applies a lump sum and a rate change together', () => {
    const both = reviseLoan({ ...running, prepayment: 200_000, revisedAnnualRate: 7 });
    const prepayOnly = reviseLoan({ ...running, prepayment: 200_000 });
    expect(both.interestSavedKeepingEmi).toBeGreaterThan(prepayOnly.interestSavedKeepingEmi);
  });

  it('reports no change when nothing is changed', () => {
    const result = reviseLoan(running);
    expect(result.monthsSaved).toBe(0);
    expect(result.interestSavedKeepingEmi).toBeCloseTo(0, 6);
  });
});
