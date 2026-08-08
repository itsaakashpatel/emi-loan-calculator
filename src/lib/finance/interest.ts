/** Plain simple / compound interest calculators. */

import { COMPOUNDING_PERIODS, type Compounding, type GrowthRow } from './deposits';

export interface InterestInput {
  principal: number;
  annualRate: number;
  years: number;
  months?: number;
}

export interface SimpleInterestResult {
  principal: number;
  interest: number;
  total: number;
  termMonths: number;
  rows: GrowthRow[];
}

/** `I = P·r·t` — interest is not added to the base. */
export function calculateSimpleInterest(input: InterestInput): SimpleInterestResult {
  const principal = Math.max(0, input.principal);
  const termMonths = Math.max(1, Math.round(input.years * 12 + (input.months ?? 0)));
  const t = termMonths / 12;
  const r = input.annualRate / 100;
  const interest = principal * r * t;

  const rows: GrowthRow[] = [];
  let previous = principal;
  for (let year = 1; year <= Math.ceil(t); year += 1) {
    const at = Math.min(year, t);
    const closing = principal * (1 + r * at);
    rows.push({
      year,
      opening: previous,
      deposited: year === 1 ? principal : 0,
      interest: closing - previous,
      closing,
    });
    previous = closing;
  }

  return { principal, interest, total: principal + interest, termMonths, rows };
}

export interface CompoundInterestInput extends InterestInput {
  compounding?: Exclude<Compounding, 'simple'>;
}

export interface CompoundInterestResult extends SimpleInterestResult {
  /** Annual rate that a once-a-year compounding would need to match this schedule. */
  effectiveAnnualRatePct: number;
}

/** `A = P(1 + r/n)^(n·t)`. */
export function calculateCompoundInterest(input: CompoundInterestInput): CompoundInterestResult {
  const principal = Math.max(0, input.principal);
  const termMonths = Math.max(1, Math.round(input.years * 12 + (input.months ?? 0)));
  const t = termMonths / 12;
  const n = COMPOUNDING_PERIODS[input.compounding ?? 'yearly'];
  const r = input.annualRate / 100;
  const valueAt = (at: number) => principal * Math.pow(1 + r / n, n * at);
  const total = valueAt(t);

  const rows: GrowthRow[] = [];
  let previous = principal;
  for (let year = 1; year <= Math.ceil(t); year += 1) {
    const closing = valueAt(Math.min(year, t));
    rows.push({
      year,
      opening: previous,
      deposited: year === 1 ? principal : 0,
      interest: closing - previous,
      closing,
    });
    previous = closing;
  }

  return {
    principal,
    interest: total - principal,
    total,
    termMonths,
    rows,
    effectiveAnnualRatePct: (Math.pow(1 + r / n, n) - 1) * 100,
  };
}
