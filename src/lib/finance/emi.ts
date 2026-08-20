/**
 * Loan amortisation engine.
 *
 * Everything is computed in minor units (paise/cents) as integers so a schedule always balances:
 * the final installment absorbs the rounding residual, making `sum(principal) === principal`.
 *
 * Pure TypeScript — no React Native imports — so it is directly unit-testable and is the single
 * source of truth for every number the UI and the PDFs show.
 */

import { addMonths, compareISO, monthsBetween, todayISO } from '../format/date';
import type {
  LoanEvent,
  LoanInput,
  LoanResult,
  MoratoriumEvent,
  PartPaymentEvent,
  RateChangeEvent,
  ScheduleRow,
  YearGroup,
} from './types';

/** Hard stop so a pathological input can never spin forever (100 years of installments). */
const MAX_MONTHS = 1200;

export function toMinor(value: number): number {
  return Math.round(value * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

/** Annual nominal percentage -> per-month decimal rate. */
export function monthlyRate(annualRate: number): number {
  return annualRate / 1200;
}

/** Present-value factor of an ordinary annuity of 1 for `n` periods. */
export function annuityFactor(n: number, r: number): number {
  if (n <= 0) return 0;
  if (r === 0) return n;
  return (1 - Math.pow(1 + r, -n)) / r;
}

/**
 * `E = P·r·(1+r)^n / ((1+r)^n − 1)`, in minor units.
 *
 * Rounded **up** to the paisa, the way lenders quote it. Rounding to nearest would leave the EMI a
 * fraction short of the exact requirement, forcing a spurious extra installment at the end; rounding
 * up instead makes the final installment marginally smaller and closes the loan in exactly `n`.
 */
export function computeEmiMinor(principalMinor: number, r: number, n: number): number {
  if (n <= 0 || principalMinor <= 0) return 0;
  if (r === 0) return Math.ceil(principalMinor / n);
  const factor = Math.pow(1 + r, n);
  return Math.ceil((principalMinor * r * factor) / (factor - 1));
}

/** Convenience wrapper in major units. */
export function computeEmi(principal: number, annualRate: number, tenureMonths: number): number {
  return fromMinor(computeEmiMinor(toMinor(principal), monthlyRate(annualRate), Math.round(tenureMonths)));
}

/**
 * Installments still needed to clear `balanceMinor` at a fixed EMI.
 * Returns `Infinity` when the EMI does not even cover one month of interest.
 *
 * Simulated with the same integer arithmetic as `amortize` rather than inverting the annuity
 * formula analytically — the closed form disagrees with the rounded schedule at the margin and
 * yields off-by-one tenures.
 */
export function requiredMonths(balanceMinor: number, r: number, emiMinor: number): number {
  if (balanceMinor <= 0) return 0;
  if (emiMinor <= 0) return Infinity;
  let balance = balanceMinor;
  let months = 0;
  while (balance > 0 && months < MAX_MONTHS) {
    const interest = Math.round(balance * r);
    if (emiMinor <= interest && balance + interest > emiMinor) return Infinity;
    months += 1;
    if (balance + interest <= emiMinor) return months;
    balance -= emiMinor - interest;
  }
  return balance > 0 ? Infinity : months;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/* --------------------------------------------------------------- due dates ---- */

/**
 * Three dates describe a loan, and conflating them is the classic source of an off-by-one-month
 * schedule:
 *
 * - `startDate` is the disbursement date — the day the money arrives.
 * - `firstPaymentDate` is when installment 1 falls due.
 * - the last row's date is when the loan closes.
 *
 * Lenders normally set the first installment one month after disbursement, so that is the default.
 * A borrower whose first installment falls in the disbursement month itself sets `firstPaymentDate`
 * explicitly, and the whole schedule shifts with it.
 *
 * Returns a function giving the due date of installment `no` (1-based). Every date is measured from
 * one fixed anchor rather than from the installment before it, so the day of month never drifts:
 * a loan taken on the 31st keeps falling on the 31st, and only borrows a shorter month where it
 * has to (Jan 31 -> Feb 28 -> Mar 31, never Mar 28).
 */
export function dueDateFor(startDate: string, firstPaymentDate?: string): (no: number) => string {
  // No explicit date: instalment 1 falls one month after disbursement, so the disbursement date
  // itself is the anchor.
  if (!firstPaymentDate) return (no) => addMonths(startDate, no);
  // An instalment cannot fall due before the money arrives.
  const anchor = compareISO(firstPaymentDate, startDate) < 0 ? startDate : firstPaymentDate;
  return (no) => addMonths(anchor, no - 1);
}

/** The date installment 1 falls on, with the default applied. */
export function resolveFirstPaymentDate(startDate: string, firstPaymentDate?: string): string {
  return dueDateFor(startDate, firstPaymentDate)(1);
}

/* ------------------------------------------------------------------ solving ---- */

/**
 * The EMI relationship has four variables — principal, rate, tenure, instalment — and fixing any
 * three determines the fourth. These invert the annuity formula for each, which is what the "solve
 * for" selector on the calculator drives.
 */

/** Principal affordable at a given EMI: `P = E · a(n, r)`. */
export function solvePrincipal(emi: number, annualRate: number, tenureMonths: number): number {
  const n = Math.round(tenureMonths);
  if (emi <= 0 || n <= 0) return 0;
  return emi * annuityFactor(n, monthlyRate(annualRate));
}

/**
 * Months needed to clear `principal` at a given EMI. Returns `null` when the EMI cannot cover the
 * first month's interest, in which case no finite tenure exists.
 */
export function solveTenureMonths(principal: number, annualRate: number, emi: number): number | null {
  if (principal <= 0 || emi <= 0) return null;
  const months = requiredMonths(toMinor(principal), monthlyRate(annualRate), toMinor(emi));
  return Number.isFinite(months) ? months : null;
}

/**
 * Annual rate implied by a principal, tenure and EMI, found by bisection — the annuity formula
 * cannot be rearranged for `r` in closed form. Returns `null` when the EMI is not payable
 * (below straight-line repayment, or above one month of principal).
 */
export function solveAnnualRate(principal: number, tenureMonths: number, emi: number): number | null {
  const n = Math.round(tenureMonths);
  if (principal <= 0 || n <= 0 || emi <= 0) return null;
  // At 0% the EMI is exactly P/n; anything below that never repays the principal.
  if (emi <= principal / n) return emi === principal / n ? 0 : null;

  const emiAt = (r: number) => {
    if (r === 0) return principal / n;
    const factor = Math.pow(1 + r, n);
    return (principal * r * factor) / (factor - 1);
  };

  let low = 0;
  let high = 1; // 100% per month — far beyond any real loan
  if (emiAt(high) < emi) return null;

  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (emiAt(mid) < emi) low = mid;
    else high = mid;
  }
  return ((low + high) / 2) * 1200;
}

/**
 * Loan eligibility from income: lenders cap total EMIs at a fixed share of monthly income (the
 * fixed-obligation-to-income ratio), net of what is already being repaid.
 */
export interface EligibilityInput {
  monthlyIncome: number;
  /** Maximum share of income that may go to EMIs, as a percentage. */
  foirPct: number;
  /** EMIs already being paid on other loans. */
  existingEmis: number;
  annualRate: number;
  tenureMonths: number;
}

export interface EligibilityResult {
  eligibleEmi: number;
  eligibleAmount: number;
  /** The EMI ceiling before existing obligations are deducted. */
  emiCeiling: number;
}

export function calculateEligibility(input: EligibilityInput): EligibilityResult {
  const emiCeiling = Math.max(0, input.monthlyIncome) * (Math.max(0, input.foirPct) / 100);
  const eligibleEmi = Math.max(0, emiCeiling - Math.max(0, input.existingEmis));
  return {
    emiCeiling,
    eligibleEmi,
    eligibleAmount: solvePrincipal(eligibleEmi, input.annualRate, input.tenureMonths),
  };
}

const STEP_BY_FREQUENCY = { once: 0, monthly: 1, quarterly: 3, yearly: 12 } as const;

/** Whether a recurring part-payment event lands on installment `month`. */
export function partPaymentApplies(event: PartPaymentEvent, month: number): boolean {
  if (month < event.startMonth || event.amount <= 0) return false;
  if (event.frequency === 'once') return month === event.startMonth;
  const step = STEP_BY_FREQUENCY[event.frequency];
  const delta = month - event.startMonth;
  if (delta % step !== 0) return false;
  const occurrence = delta / step;
  return event.count === undefined || occurrence < event.count;
}

function isPartPayment(e: LoanEvent): e is PartPaymentEvent {
  return e.kind === 'part_payment';
}
function isRateChange(e: LoanEvent): e is RateChangeEvent {
  return e.kind === 'rate_change';
}
function isMoratorium(e: LoanEvent): e is MoratoriumEvent {
  return e.kind === 'moratorium';
}

/**
 * Builds a schedule for the loan, choosing the engine from `interestMethod`.
 *
 * A flat loan is a genuinely different instrument, not a variation: its interest is fixed on the
 * original amount the day it is taken, so prepaying saves nothing and a mid-term rate change does
 * not apply. Rather than thread that through the reducing-balance engine and produce numbers that
 * quietly mean nothing, flat gets its own schedule and ignores `events` and `advanceEmis`.
 */
export function amortize(input: LoanInput): LoanResult {
  return input.interestMethod === 'flat' ? amortizeFlat(input) : amortizeReducing(input);
}

/**
 * Flat-rate schedule: interest is `P x r x years` in total, split evenly across the term, and each
 * instalment repays an equal slice of principal. The balance therefore falls in a straight line.
 */
export function amortizeFlat(input: LoanInput): LoanResult {
  const principal = Math.max(0, input.principal);
  const principalMinor = toMinor(principal);
  const tenure = clamp(Math.round(input.tenureMonths), 1, MAX_MONTHS);
  const startDate = input.startDate ?? todayISO();
  const dueDate = dueDateFor(startDate, input.firstPaymentDate);
  const firstPaymentDate = dueDate(1);
  const fees = Math.max(0, input.fees ?? 0);

  const totalInterestMinor = Math.round(principalMinor * (Math.max(0, input.annualRate) / 100) * (tenure / 12));
  const interestPerMonth = Math.round(totalInterestMinor / tenure);
  const principalPerMonth = Math.round(principalMinor / tenure);

  const schedule: ScheduleRow[] = [];
  let balance = principalMinor;
  let cumInterest = 0;
  let cumPrincipal = 0;

  for (let no = 1; no <= tenure; no += 1) {
    // The last instalment absorbs every rounding residual, so the schedule balances exactly.
    const last = no === tenure;
    const interest = last ? totalInterestMinor - cumInterest : interestPerMonth;
    const paid = last ? balance : Math.min(principalPerMonth, balance);
    const opening = balance;
    balance -= paid;
    cumInterest += interest;
    cumPrincipal += paid;

    schedule.push({
      no,
      date: dueDate(no),
      opening: fromMinor(opening),
      emi: fromMinor(paid + interest),
      interest: fromMinor(interest),
      principal: fromMinor(paid),
      prepayment: 0,
      capitalised: 0,
      closing: fromMinor(balance),
      cumInterest: fromMinor(cumInterest),
      cumPrincipal: fromMinor(cumPrincipal),
      paidPct: principalMinor === 0 ? 100 : (cumPrincipal / principalMinor) * 100,
    });
  }

  const emi = fromMinor(principalPerMonth + interestPerMonth);
  return {
    emi,
    lastEmi: schedule[schedule.length - 1]?.emi ?? emi,
    principal,
    totalInterest: fromMinor(totalInterestMinor),
    totalPrepayment: 0,
    capitalisedInterest: 0,
    fees,
    totalPayment: principal + fromMinor(totalInterestMinor) + fees,
    tenureMonths: tenure,
    advanceAmount: 0,
    advanceEmis: 0,
    startDate,
    firstPaymentDate: schedule[0]?.date ?? firstPaymentDate,
    lastPaymentDate: schedule[schedule.length - 1]?.date ?? dueDate(tenure),
    monthsToFirstPayment: monthsBetween(startDate, firstPaymentDate),
    schedule,
    yearly: groupByYear(schedule, principalMinor),
    nonAmortising: false,
  };
}

/**
 * Builds the full month-by-month schedule for a reducing-balance loan, applying advance EMIs,
 * moratoria, rate changes and part payments.
 */
export function amortizeReducing(input: LoanInput): LoanResult {
  const principal = Math.max(0, input.principal);
  const principalMinor = toMinor(principal);
  const tenure = clamp(Math.round(input.tenureMonths), 1, MAX_MONTHS);
  const startDate = input.startDate ?? todayISO();
  const dueDate = dueDateFor(startDate, input.firstPaymentDate);
  const firstPaymentDate = dueDate(1);
  const fees = Math.max(0, input.fees ?? 0);
  const events = input.events ?? [];

  const partPayments = events.filter(isPartPayment);
  const rateChanges = events.filter(isRateChange);
  const moratoria = events.filter(isMoratorium).filter((m) => m.months > 0);

  const advanceEmis = clamp(Math.round(input.advanceEmis ?? 0), 0, tenure - 1);

  let rate = monthlyRate(input.annualRate);
  let emiMinor: number;
  let balance: number;
  /** Installments the current plan still expects, counting the month about to be processed. */
  let plannedRemaining: number;

  if (advanceEmis > 0) {
    // k EMIs are collected at disbursement, the remaining (n − k) amortise the rest:
    //   P = k·E + E·a(n−k, r)  =>  E = P / (k + a(n−k, r))
    const regular = tenure - advanceEmis;
    emiMinor = Math.round(principalMinor / (advanceEmis + annuityFactor(regular, rate)));
    balance = principalMinor - advanceEmis * emiMinor;
    plannedRemaining = regular;
  } else {
    emiMinor = computeEmiMinor(principalMinor, rate, tenure);
    balance = principalMinor;
    plannedRemaining = tenure;
  }

  const advanceAmountMinor = advanceEmis * emiMinor;
  const firstEmiMinor = emiMinor;

  const schedule: ScheduleRow[] = [];
  let cumInterest = 0;
  let cumPrincipal = principalMinor - balance; // advance EMIs are pure principal at t = 0
  let totalPrepayment = 0;
  let capitalisedTotal = 0;
  let emiCashTotal = 0;
  let nonAmortising = false;
  let month = 0;

  const moratoriumAt = (m: number): MoratoriumEvent | undefined =>
    moratoria.find((mo) => m >= mo.startMonth && m < mo.startMonth + mo.months);

  while (balance > 0 && month < MAX_MONTHS) {
    month += 1;

    const rateChange = rateChanges.find((rc) => rc.startMonth === month);
    if (rateChange) {
      rate = monthlyRate(rateChange.annualRate);
      if (rateChange.mode === 'reduce_emi') {
        emiMinor = computeEmiMinor(balance, rate, Math.max(1, plannedRemaining));
      } else {
        plannedRemaining = boundedMonths(requiredMonths(balance, rate, emiMinor));
      }
    }

    const moratorium = moratoriumAt(month);
    const justEnded = !moratorium && moratoria.some((mo) => month === mo.startMonth + mo.months);
    if (justEnded) {
      const ended = moratoria.find((mo) => month === mo.startMonth + mo.months)!;
      if (ended.recovery === 'increase_emi') {
        emiMinor = computeEmiMinor(balance, rate, Math.max(1, plannedRemaining));
      } else {
        plannedRemaining = boundedMonths(requiredMonths(balance, rate, emiMinor));
      }
    }

    const opening = balance;
    const interest = Math.round(balance * rate);

    let emiPaid = 0;
    let principalPaid = 0;
    let capitalised = 0;

    if (moratorium) {
      if (moratorium.type === 'full') {
        // Nothing is paid; the accrued interest is added to the balance.
        capitalised = interest;
        balance += interest;
      } else {
        // Interest is serviced, the principal is frozen.
        emiPaid = interest;
      }
    } else {
      if (emiMinor <= interest && balance + interest > emiMinor) {
        nonAmortising = true;
        break;
      }
      if (balance + interest <= emiMinor) {
        // Final installment: pay off whatever is left, absorbing all rounding residue.
        emiPaid = balance + interest;
        principalPaid = balance;
      } else {
        emiPaid = emiMinor;
        principalPaid = emiMinor - interest;
      }
      balance -= principalPaid;
    }

    let prepayment = 0;
    if (balance > 0) {
      const requested = partPayments
        .filter((pp) => partPaymentApplies(pp, month))
        .reduce((sum, pp) => sum + toMinor(pp.amount), 0);
      prepayment = Math.min(requested, balance);
      balance -= prepayment;
    }

    cumInterest += interest;
    cumPrincipal += principalPaid + prepayment;
    totalPrepayment += prepayment;
    capitalisedTotal += capitalised;
    emiCashTotal += emiPaid;

    schedule.push({
      no: month,
      date: dueDate(month),
      opening: fromMinor(opening),
      emi: fromMinor(emiPaid),
      interest: fromMinor(interest),
      principal: fromMinor(principalPaid),
      prepayment: fromMinor(prepayment),
      closing: fromMinor(balance),
      cumInterest: fromMinor(cumInterest),
      cumPrincipal: fromMinor(cumPrincipal),
      paidPct: principalMinor > 0 ? (cumPrincipal / principalMinor) * 100 : 100,
      capitalised: fromMinor(capitalised),
      ...(moratorium ? { moratorium: moratorium.type } : null),
    });

    // A moratorium with `extend_tenure` pushes the end date out, so those months do not consume
    // the plan; with `increase_emi` the end date is fixed, so they do.
    const consumesPlan = !moratorium || moratorium.recovery === 'increase_emi';
    if (consumesPlan) plannedRemaining -= 1;

    if (prepayment > 0 && balance > 0) {
      const mode = lastPrepayMode(partPayments, month);
      const future = Math.max(0, plannedRemaining);
      if (mode === 'reduce_emi' && future > 0) {
        emiMinor = computeEmiMinor(balance, rate, future);
      } else {
        plannedRemaining = boundedMonths(requiredMonths(balance, rate, emiMinor));
      }
    }
  }

  const lastRow = schedule[schedule.length - 1];
  const firstRow = schedule[0];
  const totalPayment = fromMinor(advanceAmountMinor + emiCashTotal + totalPrepayment) + fees;

  return {
    emi: fromMinor(firstEmiMinor),
    lastEmi: lastRow ? lastRow.emi : 0,
    principal,
    totalInterest: fromMinor(cumInterest),
    totalPrepayment: fromMinor(totalPrepayment),
    capitalisedInterest: fromMinor(capitalisedTotal),
    fees,
    totalPayment,
    tenureMonths: schedule.length,
    advanceAmount: fromMinor(advanceAmountMinor),
    advanceEmis,
    startDate,
    firstPaymentDate: firstRow ? firstRow.date : firstPaymentDate,
    lastPaymentDate: lastRow ? lastRow.date : firstPaymentDate,
    monthsToFirstPayment: monthsBetween(startDate, firstPaymentDate),
    schedule,
    yearly: groupByYear(schedule, principalMinor),
    nonAmortising,
  };
}

function boundedMonths(months: number): number {
  return Number.isFinite(months) ? Math.max(1, months) : MAX_MONTHS;
}

/** Mode of the prepayment event that fired most recently — later events win. */
function lastPrepayMode(events: PartPaymentEvent[], month: number) {
  const firing = events.filter((pp) => partPaymentApplies(pp, month));
  return firing[firing.length - 1]?.mode ?? 'reduce_tenure';
}

export function groupByYear(schedule: ScheduleRow[], principalMinor: number): YearGroup[] {
  const groups: YearGroup[] = [];
  for (const row of schedule) {
    const year = Number(row.date.slice(0, 4));
    let group = groups[groups.length - 1];
    if (!group || group.year !== year) {
      group = {
        year,
        rows: [],
        emi: 0,
        principal: 0,
        interest: 0,
        prepayment: 0,
        total: 0,
        closing: 0,
        paidPct: 0,
      };
      groups.push(group);
    }
    group.rows.push(row);
    group.emi += row.emi;
    group.principal += row.principal + row.prepayment;
    group.interest += row.interest;
    group.prepayment += row.prepayment;
    group.total += row.emi + row.prepayment;
    group.closing = row.closing;
    group.paidPct = principalMinor > 0 ? row.paidPct : 100;
  }
  return groups;
}

/** Compares a loan with events against the same loan without them. */
export interface PrepaymentSavings {
  baseline: LoanResult;
  withEvents: LoanResult;
  monthsSaved: number;
  interestSaved: number;
}

export function computeSavings(input: LoanInput): PrepaymentSavings {
  const { events, ...rest } = input;
  const baseline = amortize({ ...rest, events: [] });
  const withEvents = amortize(input);
  return {
    baseline,
    withEvents,
    monthsSaved: baseline.tenureMonths - withEvents.tenureMonths,
    interestSaved: baseline.totalInterest - withEvents.totalInterest,
  };
}
