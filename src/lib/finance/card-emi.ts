/**
 * Credit-card EMI and "no-cost" EMI: what a purchase on instalments really costs.
 *
 * - Card EMI: the bank lends the full price at its rate. You pay interest, 18% GST on each month's
 *   interest, and a processing fee with GST on it.
 * - No-cost EMI: the EMI is `price / n`, so the instalments add up to the price. The bank still
 *   charges interest, but the seller gives an upfront discount equal to it, so the bank lends less
 *   than the price. GST on that interest and the processing fee are not covered by the discount,
 *   and they are the hidden cost.
 *
 * Every figure is computed in integer paise. The final instalment absorbs the rounding residual.
 * Pure TypeScript, no React Native imports.
 */

import { annuityFactor, computeEmiMinor, fromMinor, monthlyRate, toMinor } from './emi';

export type CardEmiKind = 'standard' | 'no_cost';

/** GST on financial services, applied to interest and to the processing fee. */
export const CARD_EMI_GST_PCT = 18;

export interface CardEmiInput {
  kind: CardEmiKind;
  /** Price of the purchase, in rupees. */
  price: number;
  /** Interest rate the bank charges, % p.a. */
  annualRate: number;
  tenureMonths: number;
  /** Processing fee before GST, in rupees. */
  processingFee?: number;
  /** Defaults to 18. */
  gstPct?: number;
}

export interface CardEmiRow {
  no: number;
  emi: number;
  interest: number;
  principal: number;
  gst: number;
  /** EMI plus GST: what leaves your card this month. */
  total: number;
  closing: number;
}

export interface CardEmiResult {
  emi: number;
  /** What the bank actually lends. Below the price for a no-cost EMI. */
  financed: number;
  /** No-cost only: the seller's upfront discount, equal to the interest. */
  discount: number;
  totalInterest: number;
  gstOnInterest: number;
  processingFee: number;
  gstOnFee: number;
  /** Every rupee you pay: instalments, GST and the fee. */
  totalPaid: number;
  /** `totalPaid - price`: the real cost of paying in instalments. */
  extraCost: number;
  /** Rate, % p.a., at which the price grows into what you pay. 0 when it costs nothing extra. */
  effectiveAnnualRate: number;
  rows: CardEmiRow[];
}

/**
 * Monthly rate that discounts `flows` (month 1, 2, ...) back to `presentValue`. Bisection, because
 * the payments are not equal once GST is added and the closed form no longer applies.
 */
function solveMonthlyRate(presentValue: number, flows: readonly number[]): number {
  const pv = (r: number) => flows.reduce((sum, flow, i) => sum + flow / Math.pow(1 + r, i + 1), 0);
  if (presentValue <= 0 || pv(0) <= presentValue) return 0;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > presentValue) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function calculateCardEmi(input: CardEmiInput): CardEmiResult {
  const n = Math.max(1, Math.round(input.tenureMonths));
  const r = monthlyRate(Math.max(0, input.annualRate));
  const gstRate = (input.gstPct ?? CARD_EMI_GST_PCT) / 100;
  const priceMinor = Math.max(0, toMinor(input.price));
  const feeMinor = Math.max(0, toMinor(input.processingFee ?? 0));

  // The EMI is fixed first. For a no-cost EMI the bank lends the present value of that EMI stream.
  const emiMinor =
    input.kind === 'no_cost' ? Math.ceil(priceMinor / n) : computeEmiMinor(priceMinor, r, n);
  const financedMinor =
    input.kind === 'no_cost' ? Math.min(priceMinor, Math.round(emiMinor * annuityFactor(n, r))) : priceMinor;

  const rows: CardEmiRow[] = [];
  let balance = financedMinor;
  let totalInterest = 0;
  let totalGst = 0;
  let totalEmi = 0;
  const flows: number[] = [];

  for (let no = 1; no <= n && balance > 0; no += 1) {
    const interest = Math.round(balance * r);
    const last = no === n || balance + interest <= emiMinor;
    const emi = last ? balance + interest : emiMinor;
    const principal = emi - interest;
    const gst = Math.round(interest * gstRate);
    balance -= principal;
    totalInterest += interest;
    totalGst += gst;
    totalEmi += emi;
    flows.push(emi + gst);
    rows.push({
      no,
      emi: fromMinor(emi),
      interest: fromMinor(interest),
      principal: fromMinor(principal),
      gst: fromMinor(gst),
      total: fromMinor(emi + gst),
      closing: fromMinor(balance),
    });
  }

  const gstOnFee = Math.round(feeMinor * gstRate);
  const totalPaid = totalEmi + totalGst + feeMinor + gstOnFee;
  // The fee is paid on day one, so it reduces what you effectively received.
  const monthly = solveMonthlyRate(priceMinor - feeMinor - gstOnFee, flows);

  return {
    emi: fromMinor(emiMinor),
    financed: fromMinor(financedMinor),
    discount: fromMinor(priceMinor - financedMinor),
    totalInterest: fromMinor(totalInterest),
    gstOnInterest: fromMinor(totalGst),
    processingFee: fromMinor(feeMinor),
    gstOnFee: fromMinor(gstOnFee),
    totalPaid: fromMinor(totalPaid),
    extraCost: fromMinor(totalPaid - priceMinor),
    effectiveAnnualRate: Math.round(monthly * 1200 * 100) / 100,
    rows,
  };
}
