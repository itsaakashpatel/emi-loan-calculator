/**
 * Goal planning: the SIP a target needs, a retirement corpus, NPS, and Sukanya Samriddhi.
 *
 * Every SIP here uses the same convention as `calculateSip`: monthly compounding, each instalment
 * invested at the start of the month. A one-off amount grows with yearly compounding, the same as
 * `calculateLumpsum`. Pure TypeScript, no React Native imports.
 */

import { calculateSip } from './sip';

/** Future value of a SIP of 1 a month, so a target can be divided by it. */
function sipFactor(annualRate: number, years: number, stepUpPct = 0): number {
  return calculateSip({ monthlyInvestment: 1, annualRate, years, stepUpPct }).futureValue;
}

function grow(amount: number, annualRate: number, years: number): number {
  return amount * Math.pow(1 + annualRate / 100, years);
}

/* ------------------------------------------------------------- goal SIP ---- */

export interface GoalSipInput {
  /** What the goal costs today. */
  targetToday: number;
  years: number;
  annualRate: number;
  /** Price rise a year until the goal, percent. 0 to plan in today's money. */
  inflationPct?: number;
  /** Money already set aside for the goal. */
  savedNow?: number;
  stepUpPct?: number;
}

export interface GoalSipResult {
  /** The goal's cost in the year you need it. */
  targetFuture: number;
  /** What `savedNow` grows to by then. */
  savedFuture: number;
  /** Monthly SIP in the first year. 0 when savings already cover the goal. */
  monthlySip: number;
  invested: number;
  gain: number;
  rows: Array<{ year: number; cumInvested: number; value: number }>;
}

export function calculateGoalSip(input: GoalSipInput): GoalSipResult {
  const years = Math.max(1, Math.round(input.years));
  const targetFuture = grow(Math.max(0, input.targetToday), input.inflationPct ?? 0, years);
  const savedNow = Math.max(0, input.savedNow ?? 0);
  const savedFuture = grow(savedNow, input.annualRate, years);
  const gap = Math.max(0, targetFuture - savedFuture);
  const factor = sipFactor(input.annualRate, years, input.stepUpPct);
  const monthlySip = factor > 0 ? gap / factor : 0;

  const sip = calculateSip({
    monthlyInvestment: monthlySip,
    annualRate: input.annualRate,
    years,
    stepUpPct: input.stepUpPct,
  });
  const rows = sip.rows.map((row) => ({
    year: row.year,
    cumInvested: row.cumInvested + savedNow,
    value: row.value + grow(savedNow, input.annualRate, row.year),
  }));
  const invested = sip.invested + savedNow;
  return { targetFuture, savedFuture, monthlySip, invested, gain: sip.futureValue + savedFuture - invested, rows };
}

/* ----------------------------------------------------------- retirement ---- */

export interface RetirementInput {
  currentAge: number;
  retireAge: number;
  /** Age the money must last to. */
  lifeExpectancy: number;
  /** Monthly expenses today. */
  monthlyExpense: number;
  inflationPct: number;
  /** Return on savings until retirement, percent a year. */
  preReturn: number;
  /** Return on the corpus after retirement, percent a year. */
  postReturn: number;
  savedNow?: number;
}

export interface RetirementResult {
  yearsToRetire: number;
  yearsInRetirement: number;
  /** Monthly expenses in the first month of retirement. */
  expenseAtRetirement: number;
  /** What you need on the day you retire. */
  corpusNeeded: number;
  savedFuture: number;
  /** Monthly SIP from today that closes the gap. */
  monthlySip: number;
  invested: number;
  rows: Array<{ year: number; age: number; cumInvested: number; value: number }>;
}

/**
 * The corpus is the present value, at retirement, of monthly withdrawals that rise with inflation
 * once a year, taken at the start of each month, while the rest earns `postReturn`.
 */
export function calculateRetirement(input: RetirementInput): RetirementResult {
  const yearsToRetire = Math.max(1, Math.round(input.retireAge - input.currentAge));
  const yearsInRetirement = Math.max(1, Math.round(input.lifeExpectancy - input.retireAge));
  const expenseAtRetirement = grow(Math.max(0, input.monthlyExpense), input.inflationPct, yearsToRetire);

  const i = input.postReturn / 1200;
  let corpusNeeded = 0;
  for (let m = 0; m < yearsInRetirement * 12; m += 1) {
    const withdrawal = expenseAtRetirement * Math.pow(1 + input.inflationPct / 100, Math.floor(m / 12));
    corpusNeeded += withdrawal / Math.pow(1 + i, m);
  }

  const goal = calculateGoalSip({
    targetToday: corpusNeeded,
    years: yearsToRetire,
    annualRate: input.preReturn,
    savedNow: input.savedNow,
  });

  return {
    yearsToRetire,
    yearsInRetirement,
    expenseAtRetirement,
    corpusNeeded,
    savedFuture: goal.savedFuture,
    monthlySip: goal.monthlySip,
    invested: goal.invested,
    rows: goal.rows.map((row) => ({ ...row, age: Math.round(input.currentAge) + row.year })),
  };
}

/* ------------------------------------------------------------------ NPS ---- */

/** At least 40% of the NPS corpus must buy an annuity at 60. */
export const NPS_MIN_ANNUITY_PCT = 40;
export const NPS_EXIT_AGE = 60;

export interface NpsInput {
  monthly: number;
  currentAge: number;
  annualRate: number;
  /** Share of the corpus that buys the annuity, 40-100. */
  annuityPct: number;
  /** Rate the annuity pays, percent a year. */
  annuityRate: number;
  stepUpPct?: number;
}

export interface NpsResult {
  years: number;
  invested: number;
  corpus: number;
  gain: number;
  /** Tax-free lump sum at 60. */
  lumpSum: number;
  annuityCorpus: number;
  monthlyPension: number;
  rows: Array<{ year: number; age: number; cumInvested: number; value: number }>;
}

export function calculateNps(input: NpsInput): NpsResult {
  const years = Math.max(1, Math.round(NPS_EXIT_AGE - input.currentAge));
  const annuityPct = Math.min(100, Math.max(NPS_MIN_ANNUITY_PCT, input.annuityPct));
  const sip = calculateSip({
    monthlyInvestment: Math.max(0, input.monthly),
    annualRate: input.annualRate,
    years,
    stepUpPct: input.stepUpPct,
  });
  const annuityCorpus = sip.futureValue * (annuityPct / 100);
  return {
    years,
    invested: sip.invested,
    corpus: sip.futureValue,
    gain: sip.gain,
    lumpSum: sip.futureValue - annuityCorpus,
    annuityCorpus,
    monthlyPension: (annuityCorpus * input.annuityRate) / 1200,
    rows: sip.rows.map((row) => ({
      year: row.year,
      age: Math.round(input.currentAge) + row.year,
      cumInvested: row.cumInvested,
      value: row.value,
    })),
  };
}

/* ------------------------------------------------- Sukanya Samriddhi (SSY) ---- */

export const SSY_DEPOSIT_YEARS = 15;
export const SSY_MATURITY_YEARS = 21;
export const SSY_MAX_DEPOSIT = 150_000;
export const SSY_MIN_DEPOSIT = 250;
/** The rate notified for recent quarters. The government revises it every quarter, so the field is editable. */
export const SSY_DEFAULT_RATE = 8.2;
export const SSY_MAX_OPENING_AGE = 10;

export interface SsyInput {
  yearly: number;
  annualRate: number;
  /** Girl's age when the account opens, 0-10. */
  girlAge: number;
}

export interface SsyResult {
  invested: number;
  maturity: number;
  interest: number;
  maturityAge: number;
  rows: Array<{ year: number; age: number; deposited: number; interest: number; closing: number }>;
}

/**
 * Deposits for the first 15 years, at the start of each year; the account keeps earning until it
 * matures 21 years after opening. Interest compounds yearly and is tax-free.
 */
export function calculateSsy(input: SsyInput): SsyResult {
  const deposit = Math.min(SSY_MAX_DEPOSIT, Math.max(0, input.yearly));
  const r = input.annualRate / 100;
  const startAge = Math.min(SSY_MAX_OPENING_AGE, Math.max(0, Math.round(input.girlAge)));
  let balance = 0;
  let invested = 0;
  const rows: SsyResult['rows'] = [];

  for (let year = 1; year <= SSY_MATURITY_YEARS; year += 1) {
    const deposited = year <= SSY_DEPOSIT_YEARS ? deposit : 0;
    invested += deposited;
    const interest = (balance + deposited) * r;
    balance += deposited + interest;
    rows.push({ year, age: startAge + year, deposited, interest, closing: balance });
  }

  return { invested, maturity: balance, interest: balance - invested, maturityAge: startAge + SSY_MATURITY_YEARS, rows };
}
