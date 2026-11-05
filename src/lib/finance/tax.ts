/**
 * Home loan tax benefit under the Indian Income Tax Act: Section 80C (principal) and Section 24(b)
 * (interest), split by financial year (1 April to 31 March).
 *
 * Rules applied (FY 2025-26 law):
 *
 * - Old regime, self-occupied: principal up to ₹1.5 lakh under 80C, shared with every other 80C
 *   item (EPF, PPF, ELSS, life cover). Interest up to ₹2 lakh under 24(b).
 * - Old regime, let out: principal as above. All the interest is set against the rent, but the loss
 *   from house property that can reduce other income is capped at ₹2 lakh a year. So the interest
 *   lowers taxable income by at most `70% of rent + ₹2 lakh`.
 * - New regime, self-occupied: no deduction for principal or interest.
 * - New regime, let out: interest can only cancel the taxable rent (70% of it). It cannot make a
 *   loss that reduces other income, and 80C does not exist.
 * - Under construction: no deduction until the financial year of possession. The interest paid
 *   before that year is claimed in five equal parts from the possession year, inside the same
 *   24(b) cap. 80C on principal also starts only from that year.
 * - Caps are per person. Each co-owner who is also a co-borrower claims their own share against
 *   their own caps, so `sharePct` scales the loan figures and not the caps.
 *
 * Interest capitalised in a moratorium is not counted: it was never paid as interest.
 *
 * Every figure is computed in integer paise. Pure TypeScript, no React Native imports.
 */

import { fromMinor, toMinor } from './emi';
import type { ScheduleRow } from './types';

export type TaxRegime = 'old' | 'new';
export type Occupancy = 'self' | 'let_out';

export const SECTION_80C_CAP = 150_000;
export const SECTION_24B_SELF_CAP = 200_000;
/** Loss from house property that can be set against salary or other income in one year. */
export const HOUSE_PROPERTY_LOSS_CAP = 200_000;
/** Standard deduction on rent under Section 24(a). */
export const RENT_STANDARD_DEDUCTION = 0.3;
/** Health and education cess, charged on the tax. */
export const CESS_RATE = 0.04;
/** Pre-construction interest is claimed in this many equal yearly parts. */
export const PRE_CONSTRUCTION_PARTS = 5;

/** Marginal slab rates the user can pick, in percent. */
export const OLD_REGIME_SLABS: readonly number[] = [5, 20, 30];
export const NEW_REGIME_SLABS: readonly number[] = [5, 10, 15, 20, 25, 30];

export interface TaxBenefitInput {
  schedule: readonly ScheduleRow[];
  regime: TaxRegime;
  occupancy: Occupancy;
  /** Marginal income-tax slab, in percent, before cess. */
  slabPct: number;
  /** Your share of the loan, 0-100. Defaults to 100. */
  sharePct?: number;
  /** 80C already used each year by other items, in rupees. */
  other80C?: number;
  /** Let out only: rent for the year, after municipal taxes, in rupees. */
  annualRent?: number;
  /** `YYYY-MM-DD`. Omit for a ready home. */
  possessionDate?: string;
}

export interface TaxYearRow {
  /** Calendar year the financial year starts in: FY 2026-27 is `2026`. */
  fy: number;
  label: string;
  /** Your share of the interest paid in this year. */
  interest: number;
  /** Your share of the principal repaid in this year, part payments included. */
  principal: number;
  /** Part of the pre-construction interest claimed in this year. */
  preConstruction: number;
  /** Interest deduction, after the caps. */
  interestDeduction: number;
  /** 80C deduction for principal, after the cap and other 80C items. */
  principalDeduction: number;
  /** Tax saved, cess included. */
  taxSaved: number;
  /** True when the year falls before possession, so nothing is claimed. */
  underConstruction: boolean;
}

export interface TaxBenefitResult {
  years: TaxYearRow[];
  totalInterest: number;
  totalPrincipal: number;
  totalInterestDeduction: number;
  totalPrincipalDeduction: number;
  totalTaxSaved: number;
  /** Interest paid before the possession year, claimed later in five parts. */
  preConstructionInterest: number;
  /** Interest paid that the caps leave unclaimed over the life of the loan. */
  unclaimedInterest: number;
}

/** The financial year an ISO date falls in, named by its starting calendar year. */
export function financialYearOf(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return month >= 4 ? year : year - 1;
}

/** `2026` -> `FY 2026-27`. */
export function financialYearLabel(fy: number): string {
  return `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
}

function clampPct(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, 0), 100);
}

function nonNegative(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Interest that `regime` and `occupancy` let you deduct this year, in paise. */
function interestCap(regime: TaxRegime, occupancy: Occupancy, rentMinor: number): number {
  const taxableRent = Math.round(rentMinor * (1 - RENT_STANDARD_DEDUCTION));
  if (occupancy === 'self') return regime === 'old' ? toMinor(SECTION_24B_SELF_CAP) : 0;
  return regime === 'old' ? taxableRent + toMinor(HOUSE_PROPERTY_LOSS_CAP) : taxableRent;
}

export function calculateTaxBenefit(input: TaxBenefitInput): TaxBenefitResult {
  const share = clampPct(input.sharePct, 100) / 100;
  const slab = clampPct(input.slabPct, 0) / 100;
  const rentMinor = input.occupancy === 'let_out' ? toMinor(nonNegative(input.annualRent)) : 0;
  const capInterest = interestCap(input.regime, input.occupancy, rentMinor);
  const cap80C =
    input.regime === 'old' ? Math.max(0, toMinor(SECTION_80C_CAP) - toMinor(nonNegative(input.other80C))) : 0;
  const possessionFy = input.possessionDate ? financialYearOf(input.possessionDate) : -Infinity;

  // 1. Sum the schedule by financial year, in paise, at your share.
  const byYear = new Map<number, { interest: number; principal: number }>();
  for (const row of input.schedule) {
    const fy = financialYearOf(row.date);
    const entry = byYear.get(fy) ?? { interest: 0, principal: 0 };
    entry.interest += toMinor(row.interest - row.capitalised);
    entry.principal += toMinor(row.principal + row.prepayment);
    byYear.set(fy, entry);
  }
  for (const entry of byYear.values()) {
    entry.interest = Math.max(0, Math.round(entry.interest * share));
    entry.principal = Math.max(0, Math.round(entry.principal * share));
  }

  // 2. Interest paid before possession becomes a pool claimed in five parts from that year.
  let pool = 0;
  for (const [fy, entry] of byYear) if (fy < possessionFy) pool += entry.interest;
  const part = Math.floor(pool / PRE_CONSTRUCTION_PARTS);
  const partFor = (fy: number): number => {
    if (pool === 0 || fy < possessionFy || fy >= possessionFy + PRE_CONSTRUCTION_PARTS) return 0;
    // The last part takes the paise that the equal split left over.
    return fy === possessionFy + PRE_CONSTRUCTION_PARTS - 1 ? pool - part * (PRE_CONSTRUCTION_PARTS - 1) : part;
  };

  // The five claim years must appear even if the loan closes before they end.
  const fys = new Set(byYear.keys());
  if (pool > 0) for (let i = 0; i < PRE_CONSTRUCTION_PARTS; i += 1) fys.add(possessionFy + i);

  const years: TaxYearRow[] = [];
  let totals = { interest: 0, principal: 0, interestDed: 0, principalDed: 0, saved: 0, claimable: 0 };

  for (const fy of [...fys].sort((a, b) => a - b)) {
    const entry = byYear.get(fy) ?? { interest: 0, principal: 0 };
    const underConstruction = fy < possessionFy;
    const preConstruction = partFor(fy);

    const claimable = underConstruction ? 0 : entry.interest + preConstruction;
    const interestDeduction = Math.min(claimable, capInterest);
    const principalDeduction = underConstruction ? 0 : Math.min(entry.principal, cap80C);
    const taxSaved = Math.round((interestDeduction + principalDeduction) * slab * (1 + CESS_RATE));

    totals = {
      interest: totals.interest + entry.interest,
      principal: totals.principal + entry.principal,
      interestDed: totals.interestDed + interestDeduction,
      principalDed: totals.principalDed + principalDeduction,
      saved: totals.saved + taxSaved,
      claimable: totals.claimable + claimable,
    };

    years.push({
      fy,
      label: financialYearLabel(fy),
      interest: fromMinor(entry.interest),
      principal: fromMinor(entry.principal),
      preConstruction: fromMinor(preConstruction),
      interestDeduction: fromMinor(interestDeduction),
      principalDeduction: fromMinor(principalDeduction),
      taxSaved: fromMinor(taxSaved),
      underConstruction,
    });
  }

  return {
    years,
    totalInterest: fromMinor(totals.interest),
    totalPrincipal: fromMinor(totals.principal),
    totalInterestDeduction: fromMinor(totals.interestDed),
    totalPrincipalDeduction: fromMinor(totals.principalDed),
    totalTaxSaved: fromMinor(totals.saved),
    preConstructionInterest: fromMinor(pool),
    unclaimedInterest: fromMinor(Math.max(0, totals.claimable - totals.interestDed)),
  };
}

/** The row for the financial year `today` falls in, if the loan runs in that year. */
export function currentTaxYear(result: TaxBenefitResult, today: string): TaxYearRow | undefined {
  const fy = financialYearOf(today);
  return result.years.find((row) => row.fy === fy);
}

/* --------------------------------------------------------- HRA exemption ---- */

export interface HraInput {
  /** Basic salary plus dearness allowance that counts for retirement, per year. */
  basicDa: number;
  /** HRA received from the employer, per year. */
  hraReceived: number;
  /** Rent paid, per year. */
  rentPaid: number;
  /** Mumbai, Delhi, Kolkata or Chennai. */
  metro: boolean;
}

export interface HraResult {
  /** The three limits of Section 10(13A); the exemption is the lowest. */
  limits: { received: number; rentOverTenPct: number; salaryShare: number };
  exempt: number;
  taxable: number;
  /** Which limit set the exemption. */
  binding: 'received' | 'rentOverTenPct' | 'salaryShare';
}

/**
 * HRA exemption under Section 10(13A), old regime only: the lowest of the HRA received, rent paid
 * minus 10% of basic + DA, and 50% (metro) or 40% (other cities) of basic + DA.
 */
export function calculateHra(input: HraInput): HraResult {
  const basic = Math.max(0, toMinor(input.basicDa));
  const received = Math.max(0, toMinor(input.hraReceived));
  const rentOverTenPct = Math.max(0, toMinor(input.rentPaid) - Math.round(basic * 0.1));
  const salaryShare = Math.round(basic * (input.metro ? 0.5 : 0.4));

  const limits = { received, rentOverTenPct, salaryShare };
  const binding = (Object.keys(limits) as Array<keyof typeof limits>).reduce((a, b) => (limits[b] < limits[a] ? b : a));
  const exempt = limits[binding];

  return {
    limits: {
      received: fromMinor(received),
      rentOverTenPct: fromMinor(rentOverTenPct),
      salaryShare: fromMinor(salaryShare),
    },
    exempt: fromMinor(exempt),
    taxable: fromMinor(received - exempt),
    binding,
  };
}
