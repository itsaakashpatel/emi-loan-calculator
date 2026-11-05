/**
 * Every saved loan seen together: what you owe in all, when you become debt-free, and which loan an
 * extra lump sum should go to first.
 *
 * Pure TypeScript, no React Native imports.
 */

import { amortize } from './emi';
import { compareISO } from '../format/date';
import type { AdjustMode, LoanInput } from './types';

export interface PortfolioLoan {
  id: number;
  name: string;
  annualRate: number;
  /** Principal still owed. */
  outstanding: number;
  /** EMI of the next unpaid instalment, part payments excluded. */
  currentEmi: number;
  /** Interest in the unpaid instalments. */
  interestRemaining: number;
  /** Due date of the final instalment. */
  lastPaymentDate: string;
  nextDueDate: string | null;
  nextDueAmount: number;
  closed: boolean;
}

export interface PortfolioSummary {
  activeCount: number;
  outstanding: number;
  monthlyEmi: number;
  interestRemaining: number;
  /** Rate of the whole debt, each loan weighted by what is still owed on it. */
  weightedRate: number;
  /** Last EMI of the last loan to close. `null` with no open loans. */
  debtFreeDate: string | null;
  /** The instalment that falls due first across every open loan. */
  next: { id: number; name: string; date: string; amount: number } | null;
}

export function summarisePortfolio(loans: readonly PortfolioLoan[]): PortfolioSummary {
  const open = loans.filter((loan) => !loan.closed);
  let outstanding = 0;
  let monthlyEmi = 0;
  let interestRemaining = 0;
  let rateWeight = 0;
  let debtFreeDate: string | null = null;
  let next: PortfolioSummary['next'] = null;

  for (const loan of open) {
    outstanding += loan.outstanding;
    monthlyEmi += loan.currentEmi;
    interestRemaining += loan.interestRemaining;
    rateWeight += loan.outstanding * loan.annualRate;
    if (debtFreeDate === null || compareISO(loan.lastPaymentDate, debtFreeDate) > 0) {
      debtFreeDate = loan.lastPaymentDate;
    }
    if (loan.nextDueDate && (next === null || compareISO(loan.nextDueDate, next.date) < 0)) {
      next = { id: loan.id, name: loan.name, date: loan.nextDueDate, amount: loan.nextDueAmount };
    }
  }

  return {
    activeCount: open.length,
    outstanding,
    monthlyEmi,
    interestRemaining,
    weightedRate: outstanding > 0 ? Math.round((rateWeight / outstanding) * 100) / 100 : 0,
    debtFreeDate,
    next,
  };
}

export interface PrepayCandidate {
  id: number;
  name: string;
  input: LoanInput;
  /** The first unpaid instalment: the part payment lands on it. */
  nextInstallment: number;
}

export interface PrepayOption {
  id: number;
  name: string;
  annualRate: number;
  /** What actually goes in: the lump sum, capped at what that loan still owes. */
  applied: number;
  interestSaved: number;
  monthsSaved: number;
  /** EMI after the part payment. Lower only in `reduce_emi` mode. */
  newEmi: number;
  newLastPaymentDate: string;
  /** True when the lump sum clears the loan. */
  closesLoan: boolean;
}

/**
 * Puts `amount` into each open loan in turn, as a one-time part payment on its next instalment, and
 * ranks the loans by the interest that saves. This is the avalanche method, but measured on the
 * real schedules rather than by the rate alone, so tenure and existing part payments count too.
 */
export function rankPrepayment(
  candidates: readonly PrepayCandidate[],
  amount: number,
  mode: AdjustMode = 'reduce_tenure',
): PrepayOption[] {
  if (amount <= 0) return [];
  const options: PrepayOption[] = [];

  for (const candidate of candidates) {
    const base = amortize(candidate.input);
    const at = base.schedule.find((row) => row.no === candidate.nextInstallment);
    if (!at) continue;
    // A lump sum larger than the balance only clears it; the rest stays with you.
    const owed = at.opening - at.principal;
    const applied = Math.min(amount, Math.max(0, owed));
    if (applied <= 0) continue;

    const withPrepay = amortize({
      ...candidate.input,
      events: [
        ...(candidate.input.events ?? []),
        { kind: 'part_payment', amount: applied, startMonth: candidate.nextInstallment, frequency: 'once', mode },
      ],
    });
    const after = withPrepay.schedule.find((row) => row.no === candidate.nextInstallment + 1);

    options.push({
      id: candidate.id,
      name: candidate.name,
      annualRate: candidate.input.annualRate,
      applied,
      interestSaved: Math.max(0, Math.round((base.totalInterest - withPrepay.totalInterest) * 100) / 100),
      monthsSaved: Math.max(0, base.tenureMonths - withPrepay.tenureMonths),
      newEmi: after?.emi ?? 0,
      newLastPaymentDate: withPrepay.lastPaymentDate,
      closesLoan: applied >= owed,
    });
  }

  return options.sort((a, b) => b.interestSaved - a.interestSaved || b.annualRate - a.annualRate);
}
