/** Side-by-side comparison of loan scenarios. */

import { amortize } from './emi';
import type { LoanInput, LoanResult } from './types';

export interface ComparisonScenario extends LoanInput {
  id: string;
  label: string;
}

export interface ComparisonEntry {
  id: string;
  label: string;
  input: ComparisonScenario;
  result: LoanResult;
  /** Extra total cost versus the cheapest scenario. `0` for the winner. */
  extraCost: number;
  /** Difference in EMI versus the cheapest scenario. */
  emiDelta: number;
  isBest: boolean;
}

export interface ComparisonResult {
  entries: ComparisonEntry[];
  bestId: string | null;
  /** Spread between the cheapest and priciest total outflow. */
  maxSaving: number;
}

/** Ranks scenarios by total outflow (interest + fees), the number that actually matters. */
export function compareLoans(scenarios: ComparisonScenario[]): ComparisonResult {
  const priced = scenarios.map((input) => ({ input, result: amortize(input) }));
  if (priced.length === 0) return { entries: [], bestId: null, maxSaving: 0 };

  const totals = priced.map((p) => p.result.totalPayment);
  const cheapest = Math.min(...totals);
  const priciest = Math.max(...totals);
  const best = priced.find((p) => p.result.totalPayment === cheapest);
  const baselineEmi = best?.result.emi ?? 0;

  const entries: ComparisonEntry[] = priced.map(({ input, result }) => ({
    id: input.id,
    label: input.label,
    input,
    result,
    extraCost: result.totalPayment - cheapest,
    emiDelta: result.emi - baselineEmi,
    isBest: input.id === best?.input.id,
  }));

  return { entries, bestId: best?.input.id ?? null, maxSaving: priciest - cheapest };
}
