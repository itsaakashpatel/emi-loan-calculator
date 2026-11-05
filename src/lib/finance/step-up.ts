/**
 * Step-up EMI: the EMI rises by a fixed percentage each year, the way a salary does. The loan then
 * closes early and costs less interest than the same loan at a flat EMI.
 *
 * Integer paise throughout; the final instalment absorbs the residual. Pure TypeScript.
 */

import { amortize, computeEmiMinor, fromMinor, monthlyRate, toMinor } from './emi';

export interface StepUpInput {
  principal: number;
  annualRate: number;
  tenureMonths: number;
  /** Rise in the EMI every 12 instalments, percent. */
  stepUpPct: number;
}

export interface StepUpYear {
  year: number;
  emi: number;
  interest: number;
  principal: number;
  closing: number;
}

export interface StepUpResult {
  /** EMI in year 1, the same as the flat EMI. */
  startEmi: number;
  /** EMI in the final full year. */
  finalEmi: number;
  months: number;
  totalInterest: number;
  flatMonths: number;
  flatInterest: number;
  monthsSaved: number;
  interestSaved: number;
  years: StepUpYear[];
}

export function calculateStepUpEmi(input: StepUpInput): StepUpResult {
  const n = Math.max(1, Math.round(input.tenureMonths));
  const r = monthlyRate(Math.max(0, input.annualRate));
  const principalMinor = Math.max(0, toMinor(input.principal));
  const startEmi = computeEmiMinor(principalMinor, r, n);
  const step = 1 + Math.max(0, input.stepUpPct) / 100;
  const flat = amortize({ principal: input.principal, annualRate: input.annualRate, tenureMonths: n });

  let balance = principalMinor;
  let emi = startEmi;
  let months = 0;
  let totalInterest = 0;
  const years: StepUpYear[] = [];
  let year: StepUpYear | null = null;

  while (balance > 0 && months < n) {
    if (months > 0 && months % 12 === 0) emi = Math.ceil(emi * step);
    if (months % 12 === 0) {
      year = { year: months / 12 + 1, emi: fromMinor(emi), interest: 0, principal: 0, closing: 0 };
      years.push(year);
    }
    const interest = Math.round(balance * r);
    const pay = Math.min(emi, balance + interest);
    const principal = pay - interest;
    balance -= principal;
    totalInterest += interest;
    months += 1;
    year!.interest += fromMinor(interest);
    year!.principal += fromMinor(principal);
    year!.closing = fromMinor(balance);
  }

  for (const y of years) {
    y.interest = Math.round(y.interest * 100) / 100;
    y.principal = Math.round(y.principal * 100) / 100;
  }
  const total = fromMinor(totalInterest);

  return {
    startEmi: fromMinor(startEmi),
    finalEmi: years[years.length - 1]?.emi ?? 0,
    months,
    totalInterest: total,
    flatMonths: flat.tenureMonths,
    flatInterest: flat.totalInterest,
    monthsSaved: flat.tenureMonths - months,
    interestSaved: Math.round((flat.totalInterest - total) * 100) / 100,
    years,
  };
}
