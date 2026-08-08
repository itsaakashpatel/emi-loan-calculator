/** SIP (with optional annual step-up), lumpsum growth, and SWP drawdown. */

export interface SipInput {
  monthlyInvestment: number;
  /** Expected annual return, percent. */
  annualRate: number;
  years: number;
  months?: number;
  /** Annual increase applied to the installment, percent. `0` = a flat SIP. */
  stepUpPct?: number;
}

export interface SipYearRow {
  year: number;
  invested: number;
  /** Cumulative amount invested by the end of this year. */
  cumInvested: number;
  value: number;
  gain: number;
}

export interface SipResult {
  invested: number;
  futureValue: number;
  gain: number;
  months: number;
  /** Installment amount in the final year (differs from the first when stepping up). */
  lastInstallment: number;
  absoluteReturnPct: number;
  rows: SipYearRow[];
}

/**
 * Month-by-month simulation of an annuity-due SIP: each installment is invested at the start of the
 * month and grows for that month. With `stepUpPct = 0` this reproduces
 * `FV = P·((1+i)^n − 1)/i·(1+i)` exactly, and step-up falls out for free.
 */
export function calculateSip(input: SipInput): SipResult {
  const months = Math.max(1, Math.round(input.years * 12 + (input.months ?? 0)));
  const i = input.annualRate / 1200;
  const stepUp = (input.stepUpPct ?? 0) / 100;

  let installment = Math.max(0, input.monthlyInvestment);
  let balance = 0;
  let invested = 0;
  let investedAtYearStart = 0;
  const rows: SipYearRow[] = [];

  for (let month = 1; month <= months; month += 1) {
    if (month > 1 && (month - 1) % 12 === 0) installment *= 1 + stepUp;
    balance = (balance + installment) * (1 + i);
    invested += installment;

    if (month % 12 === 0 || month === months) {
      const year = Math.ceil(month / 12);
      rows.push({
        year,
        invested: invested - investedAtYearStart,
        cumInvested: invested,
        value: balance,
        gain: balance - invested,
      });
      investedAtYearStart = invested;
    }
  }

  return {
    invested,
    futureValue: balance,
    gain: balance - invested,
    months,
    lastInstallment: installment,
    absoluteReturnPct: invested > 0 ? ((balance - invested) / invested) * 100 : 0,
    rows,
  };
}

export interface LumpsumInput {
  amount: number;
  annualRate: number;
  years: number;
  months?: number;
}

export interface LumpsumResult {
  invested: number;
  futureValue: number;
  gain: number;
  months: number;
  absoluteReturnPct: number;
  rows: SipYearRow[];
}

/** Annually compounded growth of a one-off investment. */
export function calculateLumpsum(input: LumpsumInput): LumpsumResult {
  const amount = Math.max(0, input.amount);
  const months = Math.max(1, Math.round(input.years * 12 + (input.months ?? 0)));
  const t = months / 12;
  const growth = (at: number) => amount * Math.pow(1 + input.annualRate / 100, at);
  const futureValue = growth(t);

  const rows: SipYearRow[] = [];
  for (let year = 1; year <= Math.ceil(t); year += 1) {
    const at = Math.min(year, t);
    const value = growth(at);
    rows.push({
      year,
      invested: year === 1 ? amount : 0,
      cumInvested: amount,
      value,
      gain: value - amount,
    });
  }

  return {
    invested: amount,
    futureValue,
    gain: futureValue - amount,
    months,
    absoluteReturnPct: amount > 0 ? ((futureValue - amount) / amount) * 100 : 0,
    rows,
  };
}

export interface SwpInput {
  corpus: number;
  monthlyWithdrawal: number;
  /** Expected annual return on the remaining corpus, percent. */
  annualRate: number;
  /** Cap the plan at this many months; omit to run until the corpus is exhausted. */
  months?: number;
}

export interface SwpMonthRow {
  month: number;
  opening: number;
  growth: number;
  withdrawal: number;
  closing: number;
}

export interface SwpResult {
  corpus: number;
  totalWithdrawn: number;
  totalGrowth: number;
  finalBalance: number;
  monthsLasted: number;
  /** True when monthly growth covers the withdrawal, so the corpus never runs out. */
  sustainable: boolean;
  rows: SwpMonthRow[];
}

const SWP_MAX_MONTHS = 1200;

/** Withdrawals happen at month end, after that month's growth is credited. */
export function calculateSwp(input: SwpInput): SwpResult {
  const corpus = Math.max(0, input.corpus);
  const withdrawal = Math.max(0, input.monthlyWithdrawal);
  const i = input.annualRate / 1200;
  const cap = input.months ? Math.min(Math.round(input.months), SWP_MAX_MONTHS) : SWP_MAX_MONTHS;
  const sustainable = withdrawal <= corpus * i;

  const rows: SwpMonthRow[] = [];
  let balance = corpus;
  let totalWithdrawn = 0;
  let totalGrowth = 0;
  let month = 0;

  while (month < cap && balance > 0) {
    month += 1;
    const opening = balance;
    const growth = balance * i;
    balance += growth;
    const taken = Math.min(withdrawal, balance);
    balance -= taken;
    totalWithdrawn += taken;
    totalGrowth += growth;
    rows.push({ month, opening, growth, withdrawal: taken, closing: balance });
    // A sustainable plan would run for the full 100-year cap; stop once that is established.
    if (!input.months && sustainable && month >= 600) break;
  }

  return {
    corpus,
    totalWithdrawn,
    totalGrowth,
    finalBalance: balance,
    monthsLasted: rows.length,
    sustainable,
    rows,
  };
}
