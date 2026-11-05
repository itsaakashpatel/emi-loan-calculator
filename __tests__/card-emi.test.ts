import { calculateCardEmi } from '../src/lib/finance/card-emi';

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe('calculateCardEmi — no-cost', () => {
  const result = calculateCardEmi({ kind: 'no_cost', price: 60_000, annualRate: 16, tenureMonths: 6, processingFee: 199 });

  it('charges price / n each month', () => {
    expect(result.emi).toBe(10_000);
    expect(result.rows).toHaveLength(6);
    expect(Math.abs(sum(result.rows.map((r) => r.emi)) - 60_000)).toBeLessThan(0.1);
  });

  it('lends less than the price, and the discount equals the interest', () => {
    expect(result.financed).toBeLessThan(60_000);
    expect(Math.abs(result.discount - result.totalInterest)).toBeLessThan(0.1);
    expect(sum(result.rows.map((r) => r.principal))).toBeCloseTo(result.financed, 2);
    expect(result.rows[result.rows.length - 1]!.closing).toBe(0);
  });

  it('leaves GST on the interest and the fee as the hidden cost', () => {
    expect(result.gstOnInterest).toBeCloseTo(result.totalInterest * 0.18, 0);
    expect(result.gstOnFee).toBe(35.82);
    expect(Math.abs(result.extraCost - (result.gstOnInterest + 199 + 35.82))).toBeLessThan(0.1);
    expect(result.effectiveAnnualRate).toBeGreaterThan(0);
    expect(result.effectiveAnnualRate).toBeLessThan(16);
  });
});

describe('calculateCardEmi — card EMI', () => {
  it('lends the full price and the principal adds back to it', () => {
    const result = calculateCardEmi({ kind: 'standard', price: 50_000, annualRate: 15, tenureMonths: 12 });
    expect(result.financed).toBe(50_000);
    expect(result.discount).toBe(0);
    expect(sum(result.rows.map((r) => r.principal))).toBe(50_000);
    // With GST on top, the true rate is above the quoted 15%.
    expect(result.effectiveAnnualRate).toBeGreaterThan(15);
    expect(result.effectiveAnnualRate).toBeLessThan(18);
  });

  it('costs nothing extra at 0% with no fee', () => {
    const result = calculateCardEmi({ kind: 'standard', price: 12_000, annualRate: 0, tenureMonths: 12 });
    expect(result.emi).toBe(1_000);
    expect(result.extraCost).toBe(0);
    expect(result.effectiveAnnualRate).toBe(0);
  });
});
