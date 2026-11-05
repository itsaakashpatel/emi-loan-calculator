import { amortize } from '../src/lib/finance/emi';
import {
  calculateTaxBenefit,
  currentTaxYear,
  financialYearLabel,
  financialYearOf,
  type TaxBenefitInput,
} from '../src/lib/finance/tax';
import type { ScheduleRow } from '../src/lib/finance/types';

function row(date: string, interest: number, principal: number, extra: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    no: 1,
    date,
    opening: 0,
    emi: interest + principal,
    interest,
    principal,
    prepayment: 0,
    closing: 0,
    cumInterest: 0,
    cumPrincipal: 0,
    paidPct: 0,
    capitalised: 0,
    ...extra,
  };
}

/** One financial year (FY 2026-27) with the given totals, split over two instalments. */
function oneYear(interest: number, principal: number): ScheduleRow[] {
  return [row('2026-04-05', interest / 2, principal / 2), row('2027-03-05', interest / 2, principal / 2)];
}

const base = (over: Partial<TaxBenefitInput>): TaxBenefitInput => ({
  schedule: oneYear(300_000, 200_000),
  regime: 'old',
  occupancy: 'self',
  slabPct: 30,
  ...over,
});

describe('financial years', () => {
  it('starts the year in April', () => {
    expect(financialYearOf('2026-03-31')).toBe(2025);
    expect(financialYearOf('2026-04-01')).toBe(2026);
    expect(financialYearLabel(2026)).toBe('FY 2026-27');
    expect(financialYearLabel(2099)).toBe('FY 2099-00');
  });
});

describe('calculateTaxBenefit', () => {
  it('caps 24(b) at 2 lakh and 80C at 1.5 lakh in the old regime, self-occupied', () => {
    const result = calculateTaxBenefit(base({}));
    expect(result.years).toHaveLength(1);
    const [year] = result.years;
    expect(year!.interestDeduction).toBe(200_000);
    expect(year!.principalDeduction).toBe(150_000);
    // 3.5 lakh at 30%, plus 4% cess.
    expect(year!.taxSaved).toBe(109_200);
    expect(result.unclaimedInterest).toBe(100_000);
  });

  it('shares the 80C cap with other 80C items', () => {
    const result = calculateTaxBenefit(base({ other80C: 100_000 }));
    expect(result.years[0]!.principalDeduction).toBe(50_000);
    const full = calculateTaxBenefit(base({ other80C: 500_000 }));
    expect(full.years[0]!.principalDeduction).toBe(0);
  });

  it('gives nothing for a self-occupied home in the new regime', () => {
    const result = calculateTaxBenefit(base({ regime: 'new' }));
    expect(result.totalTaxSaved).toBe(0);
    expect(result.totalInterestDeduction).toBe(0);
    expect(result.totalPrincipalDeduction).toBe(0);
  });

  it('lets interest on a let-out home use 70% of rent plus the 2 lakh loss cap in the old regime', () => {
    const result = calculateTaxBenefit(base({ occupancy: 'let_out', annualRent: 240_000, schedule: oneYear(500_000, 0) }));
    // 70% of 2.4 lakh is 1.68 lakh, plus 2 lakh.
    expect(result.years[0]!.interestDeduction).toBe(368_000);
  });

  it('limits a let-out home to 70% of rent in the new regime', () => {
    const result = calculateTaxBenefit(
      base({ regime: 'new', occupancy: 'let_out', annualRent: 240_000, schedule: oneYear(500_000, 100_000) }),
    );
    expect(result.years[0]!.interestDeduction).toBe(168_000);
    expect(result.years[0]!.principalDeduction).toBe(0);
  });

  it('scales the loan figures by your share but keeps the caps per person', () => {
    const result = calculateTaxBenefit(base({ sharePct: 50 }));
    expect(result.years[0]!.interest).toBe(150_000);
    expect(result.years[0]!.interestDeduction).toBe(150_000);
    expect(result.years[0]!.principalDeduction).toBe(100_000);
  });

  it('claims pre-construction interest in five equal parts from the possession year', () => {
    const schedule = [
      row('2024-06-05', 100_000, 0),
      row('2025-06-05', 100_000, 50_000),
      row('2026-06-05', 150_000, 80_000),
    ];
    const result = calculateTaxBenefit(base({ schedule, possessionDate: '2026-05-01' }));
    expect(result.preConstructionInterest).toBe(200_000);

    const byFy = new Map(result.years.map((y) => [y.fy, y]));
    expect(byFy.get(2024)!.underConstruction).toBe(true);
    expect(byFy.get(2024)!.taxSaved).toBe(0);
    expect(byFy.get(2025)!.principalDeduction).toBe(0);
    expect(byFy.get(2026)!.preConstruction).toBe(40_000);
    expect(byFy.get(2026)!.interestDeduction).toBe(190_000);
    expect(byFy.get(2026)!.principalDeduction).toBe(80_000);
    // The remaining four parts appear even though the loan has no rows in those years.
    for (const fy of [2027, 2028, 2029, 2030]) expect(byFy.get(fy)!.interestDeduction).toBe(40_000);
    expect(byFy.has(2031)).toBe(false);
    expect(result.totalInterestDeduction).toBe(150_000 + 200_000);
  });

  it('keeps the five parts inside the 2 lakh cap', () => {
    const schedule = [row('2025-06-05', 500_000, 0), row('2026-06-05', 190_000, 0)];
    const result = calculateTaxBenefit(base({ schedule, possessionDate: '2026-04-01' }));
    // 1.9 lakh + 1 lakh part, capped at 2 lakh.
    expect(result.years.find((y) => y.fy === 2026)!.interestDeduction).toBe(200_000);
  });

  it('ignores interest capitalised in a moratorium', () => {
    const schedule = [row('2026-05-05', 10_000, -10_000, { capitalised: 10_000 }), row('2026-06-05', 20_000, 5_000)];
    const result = calculateTaxBenefit(base({ schedule }));
    expect(result.totalInterest).toBe(20_000);
  });

  it('splits a real schedule so the years add up to the loan totals', () => {
    const loan = amortize({ principal: 5_000_000, annualRate: 8.5, tenureMonths: 240, startDate: '2026-01-15' });
    const result = calculateTaxBenefit(base({ schedule: loan.schedule }));
    expect(result.totalInterest).toBeCloseTo(loan.totalInterest, 2);
    expect(result.totalPrincipal).toBeCloseTo(5_000_000, 2);
    expect(result.years[0]!.label).toBe('FY 2025-26');
    expect(currentTaxYear(result, '2030-07-01')!.fy).toBe(2030);
    expect(currentTaxYear(result, '2060-07-01')).toBeUndefined();
  });
});
