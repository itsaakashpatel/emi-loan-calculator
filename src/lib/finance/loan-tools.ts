/**
 * Three small loan calculators built on top of `emi.ts`'s annuity maths: a stripped-back EMI
 * calculator (the screen composes `computeEmi`/`amortize` directly, nothing to add here), an
 * affordability calculator that layers a down payment on top of `calculateEligibility`, and a
 * refinance comparison that runs the same outstanding principal through two different loans and
 * nets a switching cost against the difference.
 *
 * Pure TypeScript — no React Native imports — so it is directly unit-testable, same as `emi.ts`.
 */

import { amortize, calculateEligibility, type EligibilityInput } from './emi';

/* ------------------------------------------------------------------ affordability ---- */

export interface AffordabilityInput {
  monthlyIncome: number;
  /** Maximum share of income that may go to EMIs, as a percentage. */
  foirPct: number;
  /** EMIs already being paid on other loans. */
  existingEmis: number;
  annualRate: number;
  tenureMonths: number;
  /** Cash available upfront, on top of the loan. */
  downPayment: number;
}

export interface AffordabilityResult {
  /** The EMI ceiling before existing obligations are deducted. */
  emiCeiling: number;
  eligibleEmi: number;
  /** Loan amount the eligible EMI can carry — down payment is not part of this. */
  loanAmount: number;
  downPayment: number;
  /** The number the user actually wants: loan amount + down payment. */
  affordablePrice: number;
}

/**
 * How much house/car/asset someone can afford: `calculateEligibility` gives the loan a lender will
 * carry from income, and the down payment is added straight on top to get the total price the
 * borrower can walk into a showroom with.
 */
export function calculateAffordability(input: AffordabilityInput): AffordabilityResult {
  const eligibilityInput: EligibilityInput = {
    monthlyIncome: input.monthlyIncome,
    foirPct: input.foirPct,
    existingEmis: input.existingEmis,
    annualRate: input.annualRate,
    tenureMonths: input.tenureMonths,
  };
  const eligibility = calculateEligibility(eligibilityInput);
  const downPayment = Math.max(0, input.downPayment);

  return {
    emiCeiling: eligibility.emiCeiling,
    eligibleEmi: eligibility.eligibleEmi,
    loanAmount: eligibility.eligibleAmount,
    downPayment,
    affordablePrice: eligibility.eligibleAmount + downPayment,
  };
}

/* -------------------------------------------------------------------- refinance ---- */

export interface RefinanceInput {
  /** Principal still owed on the existing loan — this is what both legs are computed on. */
  outstandingPrincipal: number;
  existingAnnualRate: number;
  /** Months left to run on the existing loan. */
  existingTenureMonths: number;
  newAnnualRate: number;
  newTenureMonths: number;
  /** Processing/foreclosure fee charged for switching. Defaults to 0. */
  switchingCost?: number;
}

export interface RefinanceLoanSummary {
  emi: number;
  totalInterest: number;
  totalPayment: number;
  tenureMonths: number;
}

export interface RefinanceResult {
  existingLoan: RefinanceLoanSummary;
  newLoan: RefinanceLoanSummary;
  /** newLoan.emi − existingLoan.emi; negative means the new EMI is lower. */
  emiDelta: number;
  /** newLoan.totalInterest − existingLoan.totalInterest; negative means the new loan is cheaper. */
  interestDelta: number;
  switchingCost: number;
  /** Interest saved by switching, before the switching cost. Negative if refinancing costs more interest. */
  grossSaving: number;
  /** grossSaving − switchingCost — the number the verdict is based on. */
  netSaving: number;
  /** True when netSaving is positive: refinancing is worth it. */
  worthIt: boolean;
}

function summarise(principal: number, annualRate: number, tenureMonths: number): RefinanceLoanSummary {
  const result = amortize({ principal, annualRate, tenureMonths });
  return {
    emi: result.emi,
    totalInterest: result.totalInterest,
    totalPayment: result.totalPayment,
    tenureMonths: result.tenureMonths,
  };
}

/**
 * Runs the same outstanding principal through the existing loan's remaining term and a proposed
 * new loan, and nets a switching cost against the interest saved. Total interest — not the EMI — is
 * what decides `worthIt`, because a lower rate stretched over a longer tenure can lower the monthly
 * payment while still costing more overall; that trap is exactly what this calculator exists to
 * surface, so the verdict must not be fooled by a smaller EMI alone.
 */
export function calculateRefinance(input: RefinanceInput): RefinanceResult {
  const principal = Math.max(0, input.outstandingPrincipal);
  const existingLoan = summarise(principal, input.existingAnnualRate, input.existingTenureMonths);
  const newLoan = summarise(principal, input.newAnnualRate, input.newTenureMonths);
  const switchingCost = Math.max(0, input.switchingCost ?? 0);

  const emiDelta = newLoan.emi - existingLoan.emi;
  const interestDelta = newLoan.totalInterest - existingLoan.totalInterest;
  const grossSaving = existingLoan.totalInterest - newLoan.totalInterest;
  const netSaving = grossSaving - switchingCost;

  return {
    existingLoan,
    newLoan,
    emiDelta,
    interestDelta,
    switchingCost,
    grossSaving,
    netSaving,
    worthIt: netSaving > 0,
  };
}
