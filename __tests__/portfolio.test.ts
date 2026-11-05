import { rankPrepayment, summarisePortfolio, type PortfolioLoan } from '../src/lib/finance/portfolio';

const loan = (over: Partial<PortfolioLoan>): PortfolioLoan => ({
  id: 1,
  name: 'Loan',
  annualRate: 10,
  outstanding: 100_000,
  currentEmi: 5_000,
  interestRemaining: 10_000,
  lastPaymentDate: '2030-01-05',
  nextDueDate: '2026-12-05',
  nextDueAmount: 5_000,
  closed: false,
  ...over,
});

describe('summarisePortfolio', () => {
  it('adds up open loans and ignores closed ones', () => {
    const summary = summarisePortfolio([
      loan({ id: 1, name: 'Home', annualRate: 8, outstanding: 300_000, lastPaymentDate: '2040-05-05', nextDueDate: '2026-12-10' }),
      loan({ id: 2, name: 'Car', annualRate: 12, outstanding: 100_000, nextDueDate: '2026-12-02', nextDueAmount: 7_000 }),
      loan({ id: 3, name: 'Old', closed: true, outstanding: 0, lastPaymentDate: '2050-01-01' }),
    ]);
    expect(summary.activeCount).toBe(2);
    expect(summary.outstanding).toBe(400_000);
    expect(summary.monthlyEmi).toBe(10_000);
    expect(summary.interestRemaining).toBe(20_000);
    expect(summary.weightedRate).toBe(9);
    expect(summary.debtFreeDate).toBe('2040-05-05');
    expect(summary.next).toEqual({ id: 2, name: 'Car', date: '2026-12-02', amount: 7_000 });
  });

  it('is empty with no open loans', () => {
    const summary = summarisePortfolio([loan({ closed: true })]);
    expect(summary.activeCount).toBe(0);
    expect(summary.debtFreeDate).toBeNull();
    expect(summary.next).toBeNull();
    expect(summary.weightedRate).toBe(0);
  });
});

describe('rankPrepayment', () => {
  const input = (annualRate: number) => ({ principal: 500_000, annualRate, tenureMonths: 60, startDate: '2026-01-01' });

  it('puts the loan that saves the most interest first', () => {
    const options = rankPrepayment(
      [
        { id: 1, name: 'Cheap', input: input(8), nextInstallment: 1 },
        { id: 2, name: 'Dear', input: input(14), nextInstallment: 1 },
      ],
      100_000,
    );
    expect(options.map((o) => o.name)).toEqual(['Dear', 'Cheap']);
    expect(options[0]!.interestSaved).toBeGreaterThan(options[1]!.interestSaved);
    expect(options[0]!.monthsSaved).toBeGreaterThan(0);
    expect(options[0]!.closesLoan).toBe(false);
  });

  it('caps the lump sum at what the loan still owes', () => {
    const [option] = rankPrepayment([{ id: 1, name: 'Small', input: { ...input(10), principal: 20_000 }, nextInstallment: 1 }], 100_000);
    expect(option!.applied).toBeLessThan(20_000);
    expect(option!.closesLoan).toBe(true);
  });

  it('lowers the EMI instead in reduce_emi mode', () => {
    const [option] = rankPrepayment([{ id: 1, name: 'A', input: input(10), nextInstallment: 3 }], 100_000, 'reduce_emi');
    expect(option!.monthsSaved).toBe(0);
    expect(option!.newEmi).toBeGreaterThan(0);
    expect(option!.interestSaved).toBeGreaterThan(0);
  });

  it('returns nothing for a zero amount', () => {
    expect(rankPrepayment([{ id: 1, name: 'A', input: input(10), nextInstallment: 1 }], 0)).toEqual([]);
  });
});
