export type PartPaymentFrequency = 'once' | 'monthly' | 'quarterly' | 'yearly';

/** What a prepayment or rate change does to the rest of the loan. */
export type AdjustMode = 'reduce_tenure' | 'reduce_emi';

/** `full` = nothing paid and interest capitalises; `interest_only` = interest serviced. */
export type MoratoriumType = 'full' | 'interest_only';

/** How the loan recovers once the moratorium ends. */
export type MoratoriumRecovery = 'extend_tenure' | 'increase_emi';

export interface PartPaymentEvent {
  kind: 'part_payment';
  /** 1-based installment number the first prepayment lands on. */
  startMonth: number;
  amount: number;
  frequency: PartPaymentFrequency;
  mode: AdjustMode;
  /** Number of occurrences for recurring prepayments; omit for "until the loan closes". */
  count?: number;
}

export interface RateChangeEvent {
  kind: 'rate_change';
  startMonth: number;
  annualRate: number;
  mode: AdjustMode;
}

export interface MoratoriumEvent {
  kind: 'moratorium';
  startMonth: number;
  months: number;
  type: MoratoriumType;
  recovery: MoratoriumRecovery;
}

export type LoanEvent = PartPaymentEvent | RateChangeEvent | MoratoriumEvent;

export interface LoanInput {
  /** In major units (rupees/dollars), not minor units. */
  principal: number;
  /** Annual nominal rate as a percentage, e.g. `8.5`. */
  annualRate: number;
  tenureMonths: number;
  /** Disbursement date, `YYYY-MM-DD`. The first installment falls one month later. */
  startDate?: string;
  /** Number of EMIs collected upfront at disbursement (auto/consumer loans). */
  advanceEmis?: number;
  /** Processing fee etc., added to cost of the loan but not to the amortised principal. */
  fees?: number;
  events?: LoanEvent[];
}

export interface ScheduleRow {
  /** 1-based installment number. */
  no: number;
  date: string;
  opening: number;
  emi: number;
  interest: number;
  principal: number;
  /** Lump sum paid on top of the EMI this month. */
  prepayment: number;
  closing: number;
  cumInterest: number;
  cumPrincipal: number;
  /** 0-100, share of the original principal repaid so far. */
  paidPct: number;
  /** Set when the row falls inside a moratorium window. */
  moratorium?: MoratoriumType;
  /** Interest added to the balance instead of being paid. */
  capitalised: number;
}

export interface YearGroup {
  year: number;
  rows: ScheduleRow[];
  emi: number;
  principal: number;
  interest: number;
  prepayment: number;
  total: number;
  closing: number;
  paidPct: number;
}

export interface LoanResult {
  /** EMI of the first regular installment. */
  emi: number;
  /** EMI of the last installment — differs from `emi` when events change it mid-loan. */
  lastEmi: number;
  principal: number;
  totalInterest: number;
  totalPrepayment: number;
  /** Interest capitalised during a full moratorium (already counted in totalInterest). */
  capitalisedInterest: number;
  fees: number;
  /** principal + interest + fees. Prepayments are part of principal repayment. */
  totalPayment: number;
  /** Number of scheduled installments actually needed. */
  tenureMonths: number;
  /** Cash collected upfront as advance EMIs. */
  advanceAmount: number;
  advanceEmis: number;
  startDate: string;
  firstPaymentDate: string;
  lastPaymentDate: string;
  schedule: ScheduleRow[];
  yearly: YearGroup[];
  /** True when the EMI never covers the interest, so the loan cannot amortise. */
  nonAmortising: boolean;
}
