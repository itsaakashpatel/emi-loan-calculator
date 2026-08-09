import {
  calculateEligibility,
  computeEmi,
  solveAnnualRate,
  solvePrincipal,
  solveTenureMonths,
} from '../src/lib/finance/emi';
import { amountToWords } from '../src/lib/format/money';

/** Relative-tolerance helper: rounding an EMI up to the paisa means round-tripping through the
 * inverse solvers never lands on the exact original input, only very close to it. */
function expectClose(actual: number, expected: number, tolerance = 0.002) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * tolerance + 0.05);
}

const CASES = [
  { principal: 1_000_000, annualRate: 8.5, tenureMonths: 240 },
  { principal: 500_000, annualRate: 10, tenureMonths: 60 },
  { principal: 2_500_000, annualRate: 12, tenureMonths: 84 },
  { principal: 300_000, annualRate: 6.5, tenureMonths: 360 },
] as const;

describe('round-trip consistency: computeEmi <-> solvePrincipal/solveAnnualRate/solveTenureMonths', () => {
  it('matches the published 20-year home loan reference values', () => {
    const emi = computeEmi(1_000_000, 8.5, 240);
    expect(emi).toBeCloseTo(8678.24, 1);
    expectClose(solvePrincipal(emi, 8.5, 240), 1_000_000);
    expectClose(solveAnnualRate(1_000_000, 240, emi)!, 8.5, 0.01);
    expect(solveTenureMonths(1_000_000, 8.5, emi)).toBe(240);
  });

  for (const { principal, annualRate, tenureMonths } of CASES) {
    it(`recovers principal, rate and tenure for P=${principal} r=${annualRate} n=${tenureMonths}`, () => {
      const emi = computeEmi(principal, annualRate, tenureMonths);

      expectClose(solvePrincipal(emi, annualRate, tenureMonths), principal);

      const impliedRate = solveAnnualRate(principal, tenureMonths, emi);
      expect(impliedRate).not.toBeNull();
      expectClose(impliedRate!, annualRate, 0.01);

      expect(solveTenureMonths(principal, annualRate, emi)).toBe(tenureMonths);
    });
  }
});

describe('solveAnnualRate', () => {
  it('returns 0 for the exact 0% EMI (principal / n)', () => {
    // 1,20,000 over 12 months at 0% is exactly a straight-line EMI of 10,000.
    expect(solveAnnualRate(120_000, 12, 10_000)).toBe(0);
  });

  it('returns null when the EMI is below the straight-line (0%) repayment', () => {
    expect(solveAnnualRate(120_000, 12, 9_999)).toBeNull();
  });

  it('returns null when the EMI is higher than any payable rate can produce', () => {
    // Even at 100% per month for 12 months, this EMI is unreachable for such a small principal.
    expect(solveAnnualRate(120_000, 12, 50_000_000)).toBeNull();
  });

  it('returns null for degenerate inputs', () => {
    expect(solveAnnualRate(0, 12, 10_000)).toBeNull();
    expect(solveAnnualRate(120_000, 0, 10_000)).toBeNull();
    expect(solveAnnualRate(120_000, 12, 0)).toBeNull();
  });

  it('finds a positive rate for a genuinely amortising EMI', () => {
    const rate = solveAnnualRate(500_000, 60, 10_623.52);
    expect(rate).not.toBeNull();
    expectClose(rate!, 10, 0.01);
  });
});

describe('solveTenureMonths', () => {
  it('returns null when the EMI cannot cover the first month of interest', () => {
    // ₹10,00,000 at 100% p.a. accrues far more than ₹100/month in interest.
    expect(solveTenureMonths(1_000_000, 100, 100)).toBeNull();
  });

  it('returns null for degenerate inputs', () => {
    expect(solveTenureMonths(0, 8.5, 8_678.24)).toBeNull();
    expect(solveTenureMonths(1_000_000, 8.5, 0)).toBeNull();
  });

  it('divides evenly at 0%', () => {
    expect(solveTenureMonths(120_000, 0, 10_000)).toBe(12);
  });
});

describe('solvePrincipal', () => {
  it('equals emi * n at 0%', () => {
    expect(solvePrincipal(10_000, 0, 12)).toBe(120_000);
    expect(solvePrincipal(5_000, 0, 24)).toBe(120_000);
  });

  it('returns 0 for degenerate inputs', () => {
    expect(solvePrincipal(0, 8.5, 240)).toBe(0);
    expect(solvePrincipal(10_000, 8.5, 0)).toBe(0);
  });
});

describe('calculateEligibility', () => {
  const BASE = { monthlyIncome: 80_000, foirPct: 45, existingEmis: 10_000, annualRate: 10, tenureMonths: 240 };

  it('caps EMIs at FOIR and nets off existing obligations', () => {
    const result = calculateEligibility(BASE);
    expect(result.emiCeiling).toBe(36_000);
    expect(result.eligibleEmi).toBe(26_000);
    expect(result.eligibleAmount).toBeCloseTo(solvePrincipal(26_000, BASE.annualRate, BASE.tenureMonths), 6);
  });

  it('floors eligible EMI at 0 when existing EMIs exceed the ceiling, never going negative', () => {
    const result = calculateEligibility({ ...BASE, existingEmis: 50_000 });
    expect(result.emiCeiling).toBe(36_000);
    expect(result.eligibleEmi).toBe(0);
    expect(result.eligibleAmount).toBe(0);
  });

  it('treats negative income/FOIR/existingEmis as zero rather than flipping signs', () => {
    const result = calculateEligibility({ ...BASE, monthlyIncome: -80_000 });
    expect(result.emiCeiling).toBe(0);
    expect(result.eligibleEmi).toBe(0);
    expect(result.eligibleAmount).toBe(0);
  });
});

describe('amountToWords', () => {
  it('spells zero', () => {
    expect(amountToWords(0)).toBe('Zero');
  });

  it('uses the Indian crore/lakh/thousand scale by default', () => {
    expect(amountToWords(2_500_000)).toBe('Twenty Five Lakh');
    expect(amountToWords(23_303)).toBe('Twenty Three Thousand Three Hundred Three');
    expect(amountToWords(10_000_000)).toBe('One Crore');
  });

  it('handles counts above 999 within a scale by recursing (100 crore)', () => {
    // 1,00,00,00,000 = 100 crore.
    expect(amountToWords(1_00_00_00_000)).toBe('One Hundred Crore');
  });

  it('uses million/billion for western grouping', () => {
    expect(amountToWords(2_500_000, 'western')).toBe('Two Million Five Hundred Thousand');
    expect(amountToWords(3_000_000_000, 'western')).toBe('Three Billion');
  });

  it('prefixes negative amounts with Minus', () => {
    expect(amountToWords(-2_500_000)).toBe('Minus Twenty Five Lakh');
    expect(amountToWords(-100)).toBe('Minus One Hundred');
  });

  it('drops decimals, treating the value as a readability aid only', () => {
    expect(amountToWords(999.99)).toBe('Nine Hundred Ninety Nine');
  });

  it('degrades gracefully on non-finite input', () => {
    expect(amountToWords(NaN)).toBe('');
    expect(amountToWords(Infinity)).toBe('');
  });
});
