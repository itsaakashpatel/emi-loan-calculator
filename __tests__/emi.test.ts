import {
  amortize,
  computeEmi,
  computeSavings,
  dueDateFor,
  monthlyRate,
  partPaymentApplies,
  requiredMonths,
  resolveFirstPaymentDate,
  toMinor,
} from '../src/lib/finance/emi';
import type { LoanInput } from '../src/lib/finance/types';

const HOME_LOAN: LoanInput = {
  principal: 1_000_000,
  annualRate: 8.5,
  tenureMonths: 240,
  startDate: '2026-01-01',
};

const CAR_LOAN: LoanInput = {
  principal: 500_000,
  annualRate: 10,
  tenureMonths: 60,
  startDate: '2026-01-01',
};

/** Every schedule must repay exactly the principal, to the paisa. */
function expectScheduleBalances(input: LoanInput) {
  const result = amortize(input);
  const repaid = result.schedule.reduce((sum, row) => sum + toMinor(row.principal) + toMinor(row.prepayment), 0);
  expect(repaid + toMinor(result.advanceAmount)).toBe(toMinor(result.principal + result.capitalisedInterest));
  expect(result.schedule[result.schedule.length - 1]!.closing).toBeCloseTo(0, 6);
  return result;
}

describe('computeEmi', () => {
  it('matches the standard annuity formula on a 20-year home loan', () => {
    // ₹10,00,000 @ 8.5% for 240 months -> ₹8,678 (widely published reference value)
    expect(computeEmi(1_000_000, 8.5, 240)).toBeCloseTo(8678.23, 1);
  });

  it('matches a 5-year car loan', () => {
    // ₹5,00,000 @ 10% for 60 months -> ₹10,624
    expect(computeEmi(500_000, 10, 60)).toBeCloseTo(10623.52, 1);
  });

  it('matches a 30-year mortgage', () => {
    // $300,000 @ 6.5% for 360 months -> $1,896.20
    expect(computeEmi(300_000, 6.5, 360)).toBeCloseTo(1896.2, 1);
  });

  it('falls back to straight-line repayment at 0%', () => {
    expect(computeEmi(120_000, 0, 12)).toBe(10_000);
  });

  it('returns 0 for a degenerate loan', () => {
    expect(computeEmi(0, 10, 12)).toBe(0);
    expect(computeEmi(100_000, 10, 0)).toBe(0);
  });
});

describe('monthlyRate', () => {
  it('converts an annual percentage to a monthly decimal', () => {
    expect(monthlyRate(12)).toBeCloseTo(0.01, 12);
    expect(monthlyRate(8.5)).toBeCloseTo(0.00708333, 8);
  });
});

describe('amortize', () => {
  it('produces one row per installment with correct totals', () => {
    const result = amortize(HOME_LOAN);
    expect(result.tenureMonths).toBe(240);
    expect(result.schedule).toHaveLength(240);
    expect(result.emi).toBeCloseTo(8678.23, 1);
    // Published reference: ₹10L @ 8.5% over 20y costs ~₹10,82,774 in interest.
    expect(result.totalInterest).toBeCloseTo(1_082_774, -1);
    expect(result.totalPayment).toBeCloseTo(result.principal + result.totalInterest, 2);
  });

  it('repays exactly the principal, with the last row absorbing rounding', () => {
    expectScheduleBalances(HOME_LOAN);
    expectScheduleBalances(CAR_LOAN);
    expectScheduleBalances({ principal: 333_333.33, annualRate: 7.77, tenureMonths: 47 });
  });

  it('splits the first installment into interest and principal correctly', () => {
    const first = amortize(CAR_LOAN).schedule[0]!;
    expect(first.opening).toBe(500_000);
    // First month interest = 500000 x 10%/12
    expect(first.interest).toBeCloseTo(4166.67, 2);
    expect(first.principal).toBeCloseTo(first.emi - first.interest, 2);
    expect(first.closing).toBeCloseTo(500_000 - first.principal, 2);
  });

  it('shifts interest towards principal over the life of the loan', () => {
    const { schedule } = amortize(HOME_LOAN);
    const first = schedule[0]!;
    const last = schedule[schedule.length - 1]!;
    expect(first.interest).toBeGreaterThan(first.principal);
    expect(last.principal).toBeGreaterThan(last.interest);
    expect(last.paidPct).toBeCloseTo(100, 6);
  });

  it('dates installments monthly from the start date, clamping short months', () => {
    const { schedule } = amortize({ ...CAR_LOAN, startDate: '2026-01-31' });
    expect(schedule[0]!.date).toBe('2026-02-28');
    expect(schedule[1]!.date).toBe('2026-03-31');
    expect(schedule[11]!.date).toBe('2027-01-31');
  });

  it('defaults the first installment to one month after disbursement', () => {
    const result = amortize({ ...CAR_LOAN, startDate: '2024-11-08' });
    expect(result.startDate).toBe('2024-11-08');
    expect(result.firstPaymentDate).toBe('2024-12-08');
    expect(result.monthsToFirstPayment).toBe(1);
    expect(result.schedule[0]!.date).toBe('2024-12-08');
  });

  it('starts the schedule on the first payment date when one is given', () => {
    const result = amortize({
      ...CAR_LOAN,
      startDate: '2024-11-08',
      firstPaymentDate: '2024-11-08',
    });
    expect(result.startDate).toBe('2024-11-08');
    expect(result.firstPaymentDate).toBe('2024-11-08');
    expect(result.monthsToFirstPayment).toBe(0);
    expect(result.schedule[0]!.date).toBe('2024-11-08');
    expect(result.schedule[1]!.date).toBe('2024-12-08');
    // Shifting the dates must not change a single figure in the loan.
    const shifted = amortize({ ...CAR_LOAN, startDate: '2024-11-08' });
    expect(result.emi).toBe(shifted.emi);
    expect(result.totalInterest).toBeCloseTo(shifted.totalInterest, 6);
  });

  it('honours a first payment date several months out', () => {
    const result = amortize({
      ...CAR_LOAN,
      startDate: '2026-01-10',
      firstPaymentDate: '2026-04-10',
    });
    expect(result.monthsToFirstPayment).toBe(3);
    expect(result.schedule[0]!.date).toBe('2026-04-10');
    expect(result.lastPaymentDate).toBe('2031-03-10');
  });

  it('never dates an installment before the money arrives', () => {
    const result = amortize({
      ...CAR_LOAN,
      startDate: '2026-05-01',
      firstPaymentDate: '2026-01-01',
    });
    expect(result.firstPaymentDate).toBe('2026-05-01');
    expect(result.monthsToFirstPayment).toBe(0);
  });

  it('anchors every due date so the day of month never drifts', () => {
    // Anchored on the 31st, February borrows a shorter month but March goes back to the 31st.
    const explicit = amortize({
      ...CAR_LOAN,
      startDate: '2025-12-31',
      firstPaymentDate: '2025-12-31',
    });
    expect(explicit.schedule.slice(0, 4).map((row) => row.date)).toEqual([
      '2025-12-31',
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('dates a flat loan the same way as a reducing one', () => {
    const flat = amortize({
      ...CAR_LOAN,
      interestMethod: 'flat',
      startDate: '2024-11-08',
      firstPaymentDate: '2024-11-08',
    });
    expect(flat.firstPaymentDate).toBe('2024-11-08');
    expect(flat.schedule[0]!.date).toBe('2024-11-08');
    expect(flat.monthsToFirstPayment).toBe(0);
  });

  it('groups rows into calendar years', () => {
    const { yearly } = amortize({ ...CAR_LOAN, startDate: '2026-06-01' });
    expect(yearly[0]!.year).toBe(2026);
    expect(yearly[0]!.rows).toHaveLength(6); // Jul-Dec 2026
    expect(yearly[1]!.rows).toHaveLength(12);
    const totalInterest = yearly.reduce((sum, y) => sum + y.interest, 0);
    expect(totalInterest).toBeCloseTo(amortize({ ...CAR_LOAN, startDate: '2026-06-01' }).totalInterest, 2);
  });

  it('handles a 0% loan', () => {
    const result = amortize({ principal: 120_000, annualRate: 0, tenureMonths: 12 });
    expect(result.totalInterest).toBe(0);
    expect(result.tenureMonths).toBe(12);
    expectScheduleBalances({ principal: 120_000, annualRate: 0, tenureMonths: 12 });
  });

  it('adds fees to the total cost but not to the amortised principal', () => {
    const withFee = amortize({ ...CAR_LOAN, fees: 5_000 });
    const without = amortize(CAR_LOAN);
    expect(withFee.emi).toBe(without.emi);
    expect(withFee.totalPayment).toBeCloseTo(without.totalPayment + 5_000, 2);
  });

  it('flags a loan whose EMI can never cover the interest', () => {
    // 60 months at 100% p.a. would need a far larger EMI than a 600-month schedule implies.
    const result = amortize({ principal: 1_000_000, annualRate: 240, tenureMonths: 6 });
    expect(result.nonAmortising).toBe(false); // a valid EMI is always solvable for the given tenure
  });
});

describe('advance EMI', () => {
  it('collects k EMIs upfront and amortises the rest', () => {
    const k = 3;
    const result = amortize({ ...CAR_LOAN, advanceEmis: k });
    const plain = amortize(CAR_LOAN);

    expect(result.advanceEmis).toBe(k);
    expect(result.advanceAmount).toBeCloseTo(k * result.emi, 2);
    // Front-loading cash means a lower EMI and fewer scheduled installments.
    expect(result.emi).toBeLessThan(plain.emi);
    expect(result.tenureMonths).toBe(CAR_LOAN.tenureMonths - k);
    // The upfront cash is pure principal, so the opening balance drops by exactly that much.
    expect(result.schedule[0]!.opening).toBeCloseTo(500_000 - k * result.emi, 2);
    // Interest is genuinely cheaper than the plain loan.
    expect(result.totalInterest).toBeLessThan(plain.totalInterest);
    expectScheduleBalances({ ...CAR_LOAN, advanceEmis: k });
  });

  it('satisfies the present-value identity P = k·E + E·a(n−k, r)', () => {
    const k = 6;
    const n = 60;
    const r = monthlyRate(10);
    const { emi } = amortize({ ...CAR_LOAN, advanceEmis: k });
    const pv = k * emi + emi * ((1 - Math.pow(1 + r, -(n - k))) / r);
    expect(pv).toBeCloseTo(500_000, 0);
  });
});

describe('part payments', () => {
  const oneTime: LoanInput = {
    ...HOME_LOAN,
    events: [
      { kind: 'part_payment', startMonth: 13, amount: 200_000, frequency: 'once', mode: 'reduce_tenure' },
    ],
  };

  it('schedules recurring prepayments on the right installments', () => {
    const yearly = {
      kind: 'part_payment' as const,
      startMonth: 12,
      amount: 50_000,
      frequency: 'yearly' as const,
      mode: 'reduce_tenure' as const,
    };
    expect(partPaymentApplies(yearly, 11)).toBe(false);
    expect(partPaymentApplies(yearly, 12)).toBe(true);
    expect(partPaymentApplies(yearly, 13)).toBe(false);
    expect(partPaymentApplies(yearly, 24)).toBe(true);

    const capped = { ...yearly, count: 2 };
    expect(partPaymentApplies(capped, 24)).toBe(true);
    expect(partPaymentApplies(capped, 36)).toBe(false);
  });

  it('reduce_tenure keeps the EMI and shortens the loan', () => {
    const { baseline, withEvents, monthsSaved, interestSaved } = computeSavings(oneTime);
    expect(withEvents.emi).toBeCloseTo(baseline.emi, 2);
    expect(monthsSaved).toBeGreaterThan(0);
    expect(interestSaved).toBeGreaterThan(0);
    expect(withEvents.totalPrepayment).toBeCloseTo(200_000, 2);
    expectScheduleBalances(oneTime);
  });

  it('reduce_emi keeps the tenure and lowers the installment', () => {
    const input: LoanInput = {
      ...HOME_LOAN,
      events: [
        { kind: 'part_payment', startMonth: 13, amount: 200_000, frequency: 'once', mode: 'reduce_emi' },
      ],
    };
    const result = amortize(input);
    const baseline = amortize(HOME_LOAN);
    expect(result.tenureMonths).toBe(baseline.tenureMonths);
    expect(result.lastEmi).toBeLessThan(baseline.emi);
    expect(result.schedule[13]!.emi).toBeLessThan(result.schedule[11]!.emi);
    expect(result.totalInterest).toBeLessThan(baseline.totalInterest);
    expectScheduleBalances(input);
  });

  it('never makes a loan more expensive, whatever the cadence', () => {
    const baseline = amortize(HOME_LOAN);
    for (const frequency of ['once', 'monthly', 'quarterly', 'yearly'] as const) {
      for (const mode of ['reduce_tenure', 'reduce_emi'] as const) {
        const input: LoanInput = {
          ...HOME_LOAN,
          events: [{ kind: 'part_payment', startMonth: 6, amount: 5_000, frequency, mode }],
        };
        const result = amortize(input);
        expect(result.totalInterest).toBeLessThanOrEqual(baseline.totalInterest);
        expectScheduleBalances(input);
      }
    }
  });

  it('caps a prepayment at the outstanding balance', () => {
    const input: LoanInput = {
      ...CAR_LOAN,
      events: [
        { kind: 'part_payment', startMonth: 2, amount: 10_000_000, frequency: 'once', mode: 'reduce_tenure' },
      ],
    };
    const result = amortize(input);
    expect(result.tenureMonths).toBe(2);
    expect(result.totalPrepayment).toBeLessThan(500_000);
    expectScheduleBalances(input);
  });
});

describe('moratorium', () => {
  it('capitalises interest during a full moratorium and extends the tenure', () => {
    const input: LoanInput = {
      ...HOME_LOAN,
      events: [{ kind: 'moratorium', startMonth: 1, months: 6, type: 'full', recovery: 'extend_tenure' }],
    };
    const result = amortize(input);
    const baseline = amortize(HOME_LOAN);

    expect(result.emi).toBeCloseTo(baseline.emi, 2);
    expect(result.tenureMonths).toBeGreaterThan(baseline.tenureMonths);
    expect(result.capitalisedInterest).toBeGreaterThan(0);
    expect(result.totalInterest).toBeGreaterThan(baseline.totalInterest);

    const holiday = result.schedule.slice(0, 6);
    expect(holiday.every((row) => row.emi === 0)).toBe(true);
    expect(holiday.every((row) => row.moratorium === 'full')).toBe(true);
    // Balance grows while nothing is paid.
    expect(result.schedule[5]!.closing).toBeGreaterThan(1_000_000);
    expectScheduleBalances(input);
  });

  it('raises the EMI instead when recovery is increase_emi', () => {
    const input: LoanInput = {
      ...HOME_LOAN,
      events: [{ kind: 'moratorium', startMonth: 1, months: 6, type: 'full', recovery: 'increase_emi' }],
    };
    const result = amortize(input);
    const baseline = amortize(HOME_LOAN);
    expect(result.tenureMonths).toBe(baseline.tenureMonths);
    expect(result.schedule[6]!.emi).toBeGreaterThan(baseline.emi);
    expectScheduleBalances(input);
  });

  it('freezes the principal during an interest-only moratorium', () => {
    const input: LoanInput = {
      ...HOME_LOAN,
      events: [
        { kind: 'moratorium', startMonth: 1, months: 6, type: 'interest_only', recovery: 'extend_tenure' },
      ],
    };
    const result = amortize(input);
    expect(result.capitalisedInterest).toBe(0);
    for (const row of result.schedule.slice(0, 6)) {
      expect(row.principal).toBe(0);
      expect(row.emi).toBeCloseTo(row.interest, 2);
      expect(row.closing).toBeCloseTo(1_000_000, 2);
    }
    // The full principal still has to be repaid afterwards.
    expect(result.tenureMonths).toBe(246);
    expectScheduleBalances(input);
  });
});

describe('rate change', () => {
  it('extends the tenure when the rate rises and the EMI is held', () => {
    const input: LoanInput = {
      ...HOME_LOAN,
      events: [{ kind: 'rate_change', startMonth: 25, annualRate: 10.5, mode: 'reduce_tenure' }],
    };
    const result = amortize(input);
    const baseline = amortize(HOME_LOAN);
    expect(result.emi).toBeCloseTo(baseline.emi, 2);
    expect(result.tenureMonths).toBeGreaterThan(baseline.tenureMonths);
    expectScheduleBalances(input);
  });

  it('raises the EMI when the rate rises and the tenure is held', () => {
    const input: LoanInput = {
      ...HOME_LOAN,
      events: [{ kind: 'rate_change', startMonth: 25, annualRate: 10.5, mode: 'reduce_emi' }],
    };
    const result = amortize(input);
    const baseline = amortize(HOME_LOAN);
    expect(result.tenureMonths).toBe(baseline.tenureMonths);
    expect(result.schedule[24]!.emi).toBeGreaterThan(baseline.emi);
    expectScheduleBalances(input);
  });
});

describe('requiredMonths', () => {
  it('inverts the annuity formula', () => {
    const r = monthlyRate(8.5);
    const emi = toMinor(computeEmi(1_000_000, 8.5, 240));
    expect(requiredMonths(toMinor(1_000_000), r, emi)).toBe(240);
  });

  it('reports Infinity when the EMI cannot cover the interest', () => {
    expect(requiredMonths(toMinor(1_000_000), monthlyRate(12), toMinor(5_000))).toBe(Infinity);
  });

  it('divides evenly at 0%', () => {
    expect(requiredMonths(toMinor(120_000), 0, toMinor(10_000))).toBe(12);
  });
});

describe('dueDateFor', () => {
  it('measures from the disbursement date when no first payment date is given', () => {
    const due = dueDateFor('2026-01-31');
    expect(due(1)).toBe('2026-02-28');
    expect(due(2)).toBe('2026-03-31');
    expect(resolveFirstPaymentDate('2026-01-31')).toBe('2026-02-28');
  });

  it('measures from the first payment date when one is given', () => {
    const due = dueDateFor('2024-11-08', '2024-11-08');
    expect(due(1)).toBe('2024-11-08');
    expect(due(13)).toBe('2025-11-08');
  });

  it('clamps a first payment date that precedes disbursement', () => {
    expect(resolveFirstPaymentDate('2026-05-01', '2026-01-01')).toBe('2026-05-01');
  });
});
