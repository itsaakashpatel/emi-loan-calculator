/**
 * Two calculations that start from a loan already running, rather than from a fresh disbursement.
 *
 * - `computeFlatEmi` prices a loan quoted at a flat rate, where interest is charged on the original
 *   amount for the whole term instead of on the balance that is left.
 * - `reviseLoan` answers the question a borrower actually asks part-way through: "I have this much
 *   outstanding at this rate and I pay this EMI — what happens if I pay a lump sum, or if my rate
 *   moves?"
 */

import { computeEmi, fromMinor, monthlyRate, requiredMonths, solveAnnualRate, toMinor } from './emi';
import type { InterestMethod } from './types';

/* ------------------------------------------------------------ flat interest ---- */

export interface FlatEmiResult {
  emi: number;
  totalInterest: number;
  totalPayment: number;
  /**
   * The reducing-balance rate that costs the same. A flat rate always maps to a much higher
   * reducing rate — roughly double — because a flat loan charges interest on money already repaid.
   * `null` when the equivalent cannot be solved.
   */
  equivalentReducingRate: number | null;
}

/**
 * Flat-rate instalment: interest is `P × r × years` regardless of repayment, so the instalment is
 * simply the total divided by the term.
 */
export function computeFlatEmi(
  principal: number,
  annualRate: number,
  tenureMonths: number,
): FlatEmiResult {
  const p = Math.max(0, principal);
  const n = Math.max(0, Math.round(tenureMonths));
  if (p === 0 || n === 0) {
    return { emi: 0, totalInterest: 0, totalPayment: 0, equivalentReducingRate: null };
  }

  const totalInterest = p * (Math.max(0, annualRate) / 100) * (n / 12);
  const totalPayment = p + totalInterest;
  const emi = totalPayment / n;

  return {
    emi,
    totalInterest,
    totalPayment,
    equivalentReducingRate: solveAnnualRate(p, n, emi),
  };
}

/** The instalment for either method, so a screen can switch between them with one call. */
export function computeEmiBy(
  method: InterestMethod,
  principal: number,
  annualRate: number,
  tenureMonths: number,
): number {
  return method === 'flat'
    ? computeFlatEmi(principal, annualRate, tenureMonths).emi
    : computeEmi(principal, annualRate, tenureMonths);
}

/* --------------------------------------------------------- revised EMI/tenure ---- */

export interface ReviseInput {
  /** Principal still owed today. */
  outstanding: number;
  /** The rate being charged today. */
  currentAnnualRate: number;
  /** The instalment being paid today. */
  currentEmi: number;
  /** A lump sum paid now, reducing the outstanding balance. */
  prepayment?: number;
  /** A new rate applying from now on. Omit to keep the current rate. */
  revisedAnnualRate?: number;
}

export interface ReviseOutcome {
  /** Months left, and total interest still to pay, under this outcome. */
  tenureMonths: number;
  emi: number;
  totalInterest: number;
}

export interface ReviseResult {
  /** Where the loan stands before the change. `null` when the EMI cannot clear the balance. */
  current: ReviseOutcome | null;
  /** Keep paying the same EMI, and finish earlier. */
  keepEmi: ReviseOutcome | null;
  /** Keep the same finish date, and pay a smaller EMI. */
  keepTenure: ReviseOutcome | null;
  /** Interest saved by keeping the EMI, against the current position. */
  interestSavedKeepingEmi: number;
  /** Interest saved by keeping the tenure, against the current position. */
  interestSavedKeepingTenure: number;
  /** Months removed from the loan by keeping the EMI. */
  monthsSaved: number;
  /** Reduction in the monthly instalment when the tenure is held. */
  emiReduction: number;
  /** Balance after the lump sum is applied. */
  balanceAfterPrepayment: number;
}

/** Total interest paid clearing `balance` at `emi`, at a monthly rate of `r`. */
function interestOver(balance: number, annualRate: number, emi: number): ReviseOutcome | null {
  if (balance <= 0) return { tenureMonths: 0, emi, totalInterest: 0 };
  const months = requiredMonths(toMinor(balance), monthlyRate(annualRate), toMinor(emi));
  if (!Number.isFinite(months)) return null;
  return {
    tenureMonths: months,
    emi,
    // The last instalment is short, so total paid is not simply emi x months. Walking the balance
    // is the only way to get the interest right without duplicating the whole schedule builder.
    totalInterest: interestByWalking(balance, annualRate, emi, months),
  };
}

function interestByWalking(balance: number, annualRate: number, emi: number, months: number): number {
  const r = monthlyRate(annualRate);
  let remaining = toMinor(balance);
  const emiMinor = toMinor(emi);
  let interest = 0;
  for (let month = 0; month < months && remaining > 0; month += 1) {
    const due = Math.round(remaining * r);
    interest += due;
    remaining = remaining + due <= emiMinor ? 0 : remaining - (emiMinor - due);
  }
  return fromMinor(interest);
}

/**
 * Recomputes a running loan after a lump sum, a rate change, or both.
 *
 * Both ways of taking the benefit are returned, because they are genuinely different choices: the
 * same prepayment either shortens the loan (keeping the EMI) or lowers the instalment (keeping the
 * finish date), and the first almost always saves far more interest.
 */
export function reviseLoan(input: ReviseInput): ReviseResult {
  const outstanding = Math.max(0, input.outstanding);
  const currentRate = Math.max(0, input.currentAnnualRate);
  const currentEmi = Math.max(0, input.currentEmi);
  const prepayment = Math.min(Math.max(0, input.prepayment ?? 0), outstanding);
  const revisedRate = input.revisedAnnualRate ?? currentRate;

  const current = interestOver(outstanding, currentRate, currentEmi);
  const balance = outstanding - prepayment;

  const keepEmi = interestOver(balance, revisedRate, currentEmi);
  const keepTenure =
    current && current.tenureMonths > 0
      ? interestOver(balance, revisedRate, computeEmi(balance, revisedRate, current.tenureMonths))
      : null;

  return {
    current,
    keepEmi,
    keepTenure,
    interestSavedKeepingEmi: current && keepEmi ? current.totalInterest - keepEmi.totalInterest : 0,
    interestSavedKeepingTenure:
      current && keepTenure ? current.totalInterest - keepTenure.totalInterest : 0,
    monthsSaved: current && keepEmi ? current.tenureMonths - keepEmi.tenureMonths : 0,
    emiReduction: keepTenure ? currentEmi - keepTenure.emi : 0,
    balanceAfterPrepayment: balance,
  };
}
