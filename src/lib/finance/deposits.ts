/** Fixed deposit, recurring deposit and PPF maturity maths. Pure functions, no RN imports. */

export type Compounding = 'monthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'simple';

export const COMPOUNDING_PERIODS: Record<Exclude<Compounding, 'simple'>, number> = {
  monthly: 12,
  quarterly: 4,
  halfyearly: 2,
  yearly: 1,
};

export const COMPOUNDING_LABELS: Record<Compounding, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  halfyearly: 'Half-yearly',
  yearly: 'Yearly',
  simple: 'Simple interest',
};

export interface GrowthRow {
  /** 1-based year. */
  year: number;
  opening: number;
  deposited: number;
  interest: number;
  closing: number;
}

export interface FdInput {
  principal: number;
  annualRate: number;
  years: number;
  months?: number;
  compounding?: Compounding;
}

export interface FdResult {
  principal: number;
  maturity: number;
  interest: number;
  /** Total return over the whole term, as a percentage of the deposit. */
  totalReturnPct: number;
  termMonths: number;
  rows: GrowthRow[];
}

/** Value of an FD after `t` years. `M = P(1 + r/n)^(n·t)`, or `P(1 + r·t)` for simple interest. */
export function fdValueAt(principal: number, annualRate: number, t: number, compounding: Compounding): number {
  const r = annualRate / 100;
  if (t <= 0) return principal;
  if (compounding === 'simple') return principal * (1 + r * t);
  const n = COMPOUNDING_PERIODS[compounding];
  return principal * Math.pow(1 + r / n, n * t);
}

export function calculateFd(input: FdInput): FdResult {
  const principal = Math.max(0, input.principal);
  const compounding = input.compounding ?? 'quarterly';
  const termMonths = Math.max(1, Math.round(input.years * 12 + (input.months ?? 0)));
  const t = termMonths / 12;
  const maturity = fdValueAt(principal, input.annualRate, t, compounding);

  const rows: GrowthRow[] = [];
  const yearCount = Math.ceil(t);
  let previous = principal;
  for (let year = 1; year <= yearCount; year += 1) {
    const at = Math.min(year, t);
    const closing = fdValueAt(principal, input.annualRate, at, compounding);
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
    maturity,
    interest: maturity - principal,
    totalReturnPct: principal > 0 ? ((maturity - principal) / principal) * 100 : 0,
    termMonths,
    rows,
  };
}

export interface RdInput {
  monthlyDeposit: number;
  annualRate: number;
  months: number;
  compounding?: Exclude<Compounding, 'simple'>;
}

export interface RdResult {
  invested: number;
  maturity: number;
  interest: number;
  months: number;
  rows: GrowthRow[];
}

/**
 * Value of a recurring deposit after `m` installments. Each installment compounds for the months
 * it stays invested: `M = Σᵢ P·(1 + r/q)^(q·(m − i + 1)/12)`. With the Indian default of quarterly
 * compounding this is the familiar `(1 + r/400)^((m − i + 1)/3)`.
 */
export function rdValueAfter(
  monthlyDeposit: number,
  annualRate: number,
  m: number,
  compounding: Exclude<Compounding, 'simple'> = 'quarterly',
): number {
  if (m <= 0) return 0;
  const q = COMPOUNDING_PERIODS[compounding];
  const perPeriod = annualRate / 100 / q;
  let total = 0;
  for (let i = 1; i <= m; i += 1) {
    const monthsInvested = m - i + 1;
    total += monthlyDeposit * Math.pow(1 + perPeriod, (q * monthsInvested) / 12);
  }
  return total;
}

export function calculateRd(input: RdInput): RdResult {
  const monthly = Math.max(0, input.monthlyDeposit);
  const months = Math.max(1, Math.round(input.months));
  const compounding = input.compounding ?? 'quarterly';
  const maturity = rdValueAfter(monthly, input.annualRate, months, compounding);
  const invested = monthly * months;

  const rows: GrowthRow[] = [];
  let previous = 0;
  let investedSoFar = 0;
  for (let year = 1; year <= Math.ceil(months / 12); year += 1) {
    const elapsed = Math.min(year * 12, months);
    const closing = rdValueAfter(monthly, input.annualRate, elapsed, compounding);
    const deposited = monthly * elapsed - investedSoFar;
    rows.push({ year, opening: previous, deposited, interest: closing - previous - deposited, closing });
    previous = closing;
    investedSoFar += deposited;
  }

  return { invested, maturity, interest: maturity - invested, months, rows };
}

export interface PpfInput {
  yearlyDeposit: number;
  annualRate: number;
  years: number;
}

export interface PpfResult {
  invested: number;
  maturity: number;
  interest: number;
  years: number;
  rows: GrowthRow[];
}

export const PPF_DEFAULT_RATE = 7.1;
export const PPF_MIN_DEPOSIT = 500;
export const PPF_MAX_DEPOSIT = 150_000;
export const PPF_BASE_YEARS = 15;

/**
 * PPF with one deposit at the start of each year and annual compounding — the standard
 * approximation used by PPF calculators (the scheme itself pays on the minimum monthly balance).
 */
export function calculatePpf(input: PpfInput): PpfResult {
  const deposit = Math.max(0, input.yearlyDeposit);
  const years = Math.max(1, Math.round(input.years));
  const r = input.annualRate / 100;

  const rows: GrowthRow[] = [];
  let balance = 0;
  for (let year = 1; year <= years; year += 1) {
    const opening = balance;
    const interest = (opening + deposit) * r;
    balance = opening + deposit + interest;
    rows.push({ year, opening, deposited: deposit, interest, closing: balance });
  }

  const invested = deposit * years;
  return { invested, maturity: balance, interest: balance - invested, years, rows };
}
