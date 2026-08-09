/**
 * Declarative definitions for the seven investment calculators. Each one lists the fields it needs
 * and a `compute` that turns those field values into a headline, a breakdown, a donut and a table —
 * so `app/invest/[type].tsx` renders all of them from a single layout.
 */

import {
  COMPOUNDING_LABELS,
  PPF_BASE_YEARS,
  PPF_DEFAULT_RATE,
  PPF_MAX_DEPOSIT,
  calculateFd,
  calculatePpf,
  calculateRd,
  type Compounding,
} from './deposits';
import { calculateCompoundInterest, calculateSimpleInterest } from './interest';
import { calculateInflationImpact, calculateRealValue, calculateStp, realRateOfReturn } from './inflation';
import { calculateLumpsum, calculateSip, calculateSwp } from './sip';
import { formatMoney, formatPercent, formatTenure } from '../format/money';

export type CalculatorId =
  | 'fd'
  | 'rd'
  | 'ppf'
  | 'sip'
  | 'lumpsum'
  | 'swp'
  | 'simple'
  | 'compound'
  | 'stp'
  | 'sip_inflation'
  | 'inflation';

export const CALCULATOR_IDS: readonly CalculatorId[] = [
  'fd',
  'rd',
  'ppf',
  'sip',
  'lumpsum',
  'swp',
  'simple',
  'compound',
  'stp',
  'sip_inflation',
  'inflation',
];

export type FieldKind = 'money' | 'rate' | 'years' | 'months' | 'percent';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  min: number;
  max: number;
  step: number;
  /** Show a slider under the input. */
  slider?: boolean;
  hint?: string;
  optional?: boolean;
}

export interface OptionSpec {
  key: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export interface ResultRow {
  label: string;
  value: string;
  tone?: 'positive' | 'warning' | 'negative';
  emphasis?: boolean;
  swatch?: 'invested' | 'gain';
}

export interface ComputedResult {
  headline: { label: string; value: string; caption: string };
  /** Donut split: what you put in versus what it earned. */
  invested: number;
  gain: number;
  investedLabel: string;
  gainLabel: string;
  rows: ResultRow[];
  chart: Array<{ label: string; invested: number; value: number }>;
  table: { columns: string[]; rows: string[][] };
  note?: string;
  warning?: string;
}

export interface CalculatorSpec {
  id: CalculatorId;
  title: string;
  short: string;
  blurb: string;
  icon: string;
  fields: FieldSpec[];
  options?: OptionSpec[];
  defaults: Record<string, number | string>;
  compute: (values: Record<string, number | string>, currency: string) => ComputedResult;
}

type Values = Record<string, number | string>;

const num = (values: Values, key: string, fallback = 0): number => {
  const value = values[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const str = (values: Values, key: string, fallback: string): string => {
  const value = values[key];
  return typeof value === 'string' ? value : fallback;
};

const COMPOUNDING_OPTIONS = (['monthly', 'quarterly', 'halfyearly', 'yearly'] as const).map((value) => ({
  value,
  label: COMPOUNDING_LABELS[value],
}));

const YEARS_FIELD: FieldSpec = {
  key: 'years',
  label: 'Time period',
  kind: 'years',
  min: 1,
  max: 40,
  step: 1,
  slider: true,
};

const RATE_FIELD = (label: string, max = 30): FieldSpec => ({
  key: 'rate',
  label,
  kind: 'rate',
  min: 0,
  max: 60,
  step: 0.1,
  slider: true,
  hint: `Slider covers 1–${max}%`,
});

export const CALCULATORS: Record<CalculatorId, CalculatorSpec> = {
  fd: {
    id: 'fd',
    title: 'Fixed Deposit',
    short: 'FD',
    blurb: 'Maturity value of a one-off deposit',
    icon: 'lock-closed-outline',
    fields: [
      { key: 'principal', label: 'Total investment', kind: 'money', min: 0, max: 50_000_000, step: 10_000, slider: true },
      RATE_FIELD('Rate of interest'),
      YEARS_FIELD,
    ],
    options: [{ key: 'compounding', label: 'Compounding', options: COMPOUNDING_OPTIONS }],
    defaults: { principal: 500_000, rate: 7, years: 5, compounding: 'quarterly' },
    compute: (values, currency) => {
      const compounding = str(values, 'compounding', 'quarterly') as Compounding;
      const result = calculateFd({
        principal: num(values, 'principal'),
        annualRate: num(values, 'rate'),
        years: num(values, 'years'),
        compounding,
      });
      const money = (v: number) => formatMoney(v, { currency });
      return {
        headline: {
          label: 'Maturity value',
          value: money(result.maturity),
          caption: `after ${formatTenure(result.termMonths)} at ${formatPercent(num(values, 'rate'))}`,
        },
        invested: result.principal,
        gain: result.interest,
        investedLabel: 'Deposit',
        gainLabel: 'Interest',
        rows: [
          { label: 'Deposit', value: money(result.principal), swatch: 'invested' },
          { label: 'Interest earned', value: money(result.interest), tone: 'positive', swatch: 'gain' },
          { label: 'Total return', value: formatPercent(result.totalReturnPct, 1) },
          { label: 'Compounding', value: COMPOUNDING_LABELS[compounding] },
          { label: 'Maturity value', value: money(result.maturity), emphasis: true },
        ],
        chart: result.rows.map((row) => ({
          label: `Y${row.year}`,
          invested: result.principal,
          value: row.closing,
        })),
        table: {
          columns: ['Year', 'Opening', 'Interest', 'Closing'],
          rows: result.rows.map((row) => [
            `Year ${row.year}`,
            money(row.opening),
            money(row.interest),
            money(row.closing),
          ]),
        },
        note: 'Banks credit FD interest quarterly by default. TDS and tax on interest are not deducted here.',
      };
    },
  },

  rd: {
    id: 'rd',
    title: 'Recurring Deposit',
    short: 'RD',
    blurb: 'Monthly deposits with quarterly compounding',
    icon: 'repeat-outline',
    fields: [
      { key: 'monthly', label: 'Monthly deposit', kind: 'money', min: 0, max: 500_000, step: 500, slider: true },
      RATE_FIELD('Rate of interest'),
      { key: 'months', label: 'Time period', kind: 'months', min: 1, max: 240, step: 1, slider: true },
    ],
    options: [{ key: 'compounding', label: 'Compounding', options: COMPOUNDING_OPTIONS }],
    defaults: { monthly: 5_000, rate: 7, months: 60, compounding: 'quarterly' },
    compute: (values, currency) => {
      const compounding = str(values, 'compounding', 'quarterly') as Exclude<Compounding, 'simple'>;
      const result = calculateRd({
        monthlyDeposit: num(values, 'monthly'),
        annualRate: num(values, 'rate'),
        months: num(values, 'months', 1),
        compounding,
      });
      const money = (v: number) => formatMoney(v, { currency });
      return {
        headline: {
          label: 'Maturity value',
          value: money(result.maturity),
          caption: `${money(num(values, 'monthly'))}/month for ${formatTenure(result.months)}`,
        },
        invested: result.invested,
        gain: result.interest,
        investedLabel: 'Deposited',
        gainLabel: 'Interest',
        rows: [
          { label: 'Total deposited', value: money(result.invested), swatch: 'invested' },
          { label: 'Interest earned', value: money(result.interest), tone: 'positive', swatch: 'gain' },
          { label: 'Instalments', value: String(result.months) },
          { label: 'Maturity value', value: money(result.maturity), emphasis: true },
        ],
        chart: result.rows.map((row, index) => ({
          label: `Y${row.year}`,
          invested: result.rows.slice(0, index + 1).reduce((sum, r) => sum + r.deposited, 0),
          value: row.closing,
        })),
        table: {
          columns: ['Year', 'Deposited', 'Interest', 'Balance'],
          rows: result.rows.map((row) => [
            `Year ${row.year}`,
            money(row.deposited),
            money(row.interest),
            money(row.closing),
          ]),
        },
        note: 'Each instalment compounds only for the months it stays invested, which is why the effective return is below the headline rate.',
      };
    },
  },

  ppf: {
    id: 'ppf',
    title: 'PPF',
    short: 'PPF',
    blurb: 'Public Provident Fund, 15 years and beyond',
    icon: 'shield-checkmark-outline',
    fields: [
      {
        key: 'yearly',
        label: 'Yearly investment',
        kind: 'money',
        min: 500,
        max: PPF_MAX_DEPOSIT,
        step: 500,
        slider: true,
        hint: `₹500 – ₹1,50,000 per year`,
      },
      { key: 'rate', label: 'Rate of interest', kind: 'rate', min: 0, max: 15, step: 0.1, slider: true },
      { key: 'years', label: 'Time period', kind: 'years', min: 15, max: 50, step: 5, slider: true, hint: 'Extendable in 5-year blocks' },
    ],
    defaults: { yearly: 150_000, rate: PPF_DEFAULT_RATE, years: PPF_BASE_YEARS },
    compute: (values, currency) => {
      const result = calculatePpf({
        yearlyDeposit: num(values, 'yearly'),
        annualRate: num(values, 'rate'),
        years: num(values, 'years', PPF_BASE_YEARS),
      });
      const money = (v: number) => formatMoney(v, { currency });
      return {
        headline: {
          label: 'Maturity value',
          value: money(result.maturity),
          caption: `after ${result.years} years at ${formatPercent(num(values, 'rate'))}`,
        },
        invested: result.invested,
        gain: result.interest,
        investedLabel: 'Invested',
        gainLabel: 'Interest',
        rows: [
          { label: 'Total invested', value: money(result.invested), swatch: 'invested' },
          { label: 'Interest earned', value: money(result.interest), tone: 'positive', swatch: 'gain' },
          { label: 'Years', value: String(result.years) },
          { label: 'Maturity value', value: money(result.maturity), emphasis: true },
        ],
        chart: result.rows.map((row) => ({
          label: `Y${row.year}`,
          invested: num(values, 'yearly') * row.year,
          value: row.closing,
        })),
        table: {
          columns: ['Year', 'Deposit', 'Interest', 'Balance'],
          rows: result.rows.map((row) => [
            `Year ${row.year}`,
            money(row.deposited),
            money(row.interest),
            money(row.closing),
          ]),
        },
        note: 'Assumes one deposit at the start of each year with annual compounding. The scheme actually pays on the lowest balance between the 5th and month-end, so depositing before the 5th of April maximises returns. The maximum is ₹1,50,000 per financial year.',
        warning:
          num(values, 'yearly') > PPF_MAX_DEPOSIT
            ? `PPF caps deposits at ${money(PPF_MAX_DEPOSIT)} per year.`
            : undefined,
      };
    },
  },

  sip: {
    id: 'sip',
    title: 'SIP',
    short: 'SIP',
    blurb: 'Monthly investing, with optional step-up',
    icon: 'trending-up-outline',
    fields: [
      { key: 'monthly', label: 'Monthly investment', kind: 'money', min: 0, max: 1_000_000, step: 500, slider: true },
      { key: 'rate', label: 'Expected return', kind: 'rate', min: 0, max: 40, step: 0.5, slider: true },
      YEARS_FIELD,
      {
        key: 'stepUp',
        label: 'Annual step-up',
        kind: 'percent',
        min: 0,
        max: 50,
        step: 1,
        optional: true,
        hint: 'Raise the SIP each year',
      },
    ],
    defaults: { monthly: 10_000, rate: 12, years: 10, stepUp: 0 },
    compute: (values, currency) => {
      const stepUp = num(values, 'stepUp');
      const result = calculateSip({
        monthlyInvestment: num(values, 'monthly'),
        annualRate: num(values, 'rate'),
        years: num(values, 'years', 1),
        stepUpPct: stepUp,
      });
      const money = (v: number) => formatMoney(v, { currency });
      const rows: ResultRow[] = [
        { label: 'Total invested', value: money(result.invested), swatch: 'invested' },
        { label: 'Estimated returns', value: money(result.gain), tone: 'positive', swatch: 'gain' },
        { label: 'Absolute return', value: formatPercent(result.absoluteReturnPct, 1) },
      ];
      if (stepUp > 0) {
        rows.push({ label: 'Final monthly SIP', value: money(result.lastInstallment) });
      }
      rows.push({ label: 'Future value', value: money(result.futureValue), emphasis: true });

      return {
        headline: {
          label: 'Future value',
          value: money(result.futureValue),
          caption: `${money(num(values, 'monthly'))}/month for ${formatTenure(result.months)}${
            stepUp > 0 ? `, stepping up ${formatPercent(stepUp, 0)} a year` : ''
          }`,
        },
        invested: result.invested,
        gain: result.gain,
        investedLabel: 'Invested',
        gainLabel: 'Returns',
        rows,
        chart: result.rows.map((row) => ({
          label: `Y${row.year}`,
          invested: row.cumInvested,
          value: row.value,
        })),
        table: {
          columns: ['Year', 'Invested', 'Value', 'Gain'],
          rows: result.rows.map((row) => [
            `Year ${row.year}`,
            money(row.cumInvested),
            money(row.value),
            money(row.gain),
          ]),
        },
        note: 'Assumes a constant rate of return, compounded monthly, with each instalment invested at the start of the month. Real market returns vary year to year.',
      };
    },
  },

  lumpsum: {
    id: 'lumpsum',
    title: 'Lumpsum',
    short: 'Lumpsum',
    blurb: 'One-off investment, compounded annually',
    icon: 'ellipse-outline',
    fields: [
      { key: 'amount', label: 'Total investment', kind: 'money', min: 0, max: 100_000_000, step: 10_000, slider: true },
      { key: 'rate', label: 'Expected return', kind: 'rate', min: 0, max: 40, step: 0.5, slider: true },
      YEARS_FIELD,
    ],
    defaults: { amount: 1_000_000, rate: 12, years: 10 },
    compute: (values, currency) => {
      const result = calculateLumpsum({
        amount: num(values, 'amount'),
        annualRate: num(values, 'rate'),
        years: num(values, 'years', 1),
      });
      const money = (v: number) => formatMoney(v, { currency });
      return {
        headline: {
          label: 'Future value',
          value: money(result.futureValue),
          caption: `${money(result.invested)} invested for ${formatTenure(result.months)} at ${formatPercent(
            num(values, 'rate'),
          )}`,
        },
        invested: result.invested,
        gain: result.gain,
        investedLabel: 'Invested',
        gainLabel: 'Returns',
        rows: [
          { label: 'Amount invested', value: money(result.invested), swatch: 'invested' },
          { label: 'Estimated returns', value: money(result.gain), tone: 'positive', swatch: 'gain' },
          { label: 'Absolute return', value: formatPercent(result.absoluteReturnPct, 1) },
          { label: 'Future value', value: money(result.futureValue), emphasis: true },
        ],
        chart: result.rows.map((row) => ({
          label: `Y${row.year}`,
          invested: result.invested,
          value: row.value,
        })),
        table: {
          columns: ['Year', 'Value', 'Gain'],
          rows: result.rows.map((row) => [`Year ${row.year}`, money(row.value), money(row.gain)]),
        },
        note: 'Compounded once a year at a constant rate. A lumpsum stays invested for the whole term, so it usually beats a SIP of the same total amount.',
      };
    },
  },

  swp: {
    id: 'swp',
    title: 'SWP',
    short: 'SWP',
    blurb: 'How long a corpus funds monthly withdrawals',
    icon: 'cash-outline',
    fields: [
      { key: 'corpus', label: 'Total investment', kind: 'money', min: 0, max: 100_000_000, step: 50_000, slider: true },
      { key: 'withdrawal', label: 'Monthly withdrawal', kind: 'money', min: 0, max: 1_000_000, step: 1_000, slider: true },
      { key: 'rate', label: 'Expected return', kind: 'rate', min: 0, max: 40, step: 0.5, slider: true },
    ],
    defaults: { corpus: 5_000_000, withdrawal: 30_000, rate: 8 },
    compute: (values, currency) => {
      const result = calculateSwp({
        corpus: num(values, 'corpus'),
        monthlyWithdrawal: num(values, 'withdrawal'),
        annualRate: num(values, 'rate'),
      });
      const money = (v: number) => formatMoney(v, { currency });
      const yearly: Array<{ label: string; invested: number; value: number }> = [];
      for (let index = 11; index < result.rows.length; index += 12) {
        const row = result.rows[index]!;
        yearly.push({ label: `Y${Math.ceil(row.month / 12)}`, invested: 0, value: row.closing });
      }

      return {
        headline: {
          label: result.sustainable ? 'Withdrawals are sustainable' : 'Corpus lasts',
          value: result.sustainable ? 'Indefinitely' : formatTenure(result.monthsLasted),
          caption: `${money(num(values, 'withdrawal'))}/month from ${money(result.corpus)} at ${formatPercent(
            num(values, 'rate'),
          )}`,
        },
        invested: result.corpus,
        gain: result.totalGrowth,
        investedLabel: 'Corpus',
        gainLabel: 'Growth',
        rows: [
          { label: 'Starting corpus', value: money(result.corpus), swatch: 'invested' },
          { label: 'Growth over the period', value: money(result.totalGrowth), tone: 'positive', swatch: 'gain' },
          { label: 'Total withdrawn', value: money(result.totalWithdrawn) },
          { label: 'Months of withdrawals', value: String(result.monthsLasted) },
          { label: 'Balance left', value: money(result.finalBalance), emphasis: true },
        ],
        chart: yearly,
        table: {
          columns: ['Month', 'Opening', 'Withdrawn', 'Balance'],
          rows: result.rows
            .filter((row) => row.month % 12 === 0 || row.month === result.rows.length)
            .map((row) => [
              `Month ${row.month}`,
              money(row.opening),
              money(row.withdrawal),
              money(row.closing),
            ]),
        },
        note: result.sustainable
          ? 'Monthly growth exceeds the withdrawal, so the corpus keeps growing. Projected for 50 years.'
          : 'Withdrawals are taken at month end, after that month growth is credited. Capital gains tax on each redemption is not modelled.',
      };
    },
  },

  simple: {
    id: 'simple',
    title: 'Simple Interest',
    short: 'Simple',
    blurb: 'Interest on the original amount only',
    icon: 'remove-outline',
    fields: [
      { key: 'principal', label: 'Principal', kind: 'money', min: 0, max: 50_000_000, step: 10_000, slider: true },
      RATE_FIELD('Rate of interest'),
      YEARS_FIELD,
    ],
    defaults: { principal: 100_000, rate: 10, years: 5 },
    compute: (values, currency) => {
      const result = calculateSimpleInterest({
        principal: num(values, 'principal'),
        annualRate: num(values, 'rate'),
        years: num(values, 'years', 1),
      });
      const money = (v: number) => formatMoney(v, { currency });
      return {
        headline: {
          label: 'Total amount',
          value: money(result.total),
          caption: `${money(result.principal)} at ${formatPercent(num(values, 'rate'))} for ${formatTenure(
            result.termMonths,
          )}`,
        },
        invested: result.principal,
        gain: result.interest,
        investedLabel: 'Principal',
        gainLabel: 'Interest',
        rows: [
          { label: 'Principal', value: money(result.principal), swatch: 'invested' },
          { label: 'Interest', value: money(result.interest), tone: 'positive', swatch: 'gain' },
          { label: 'Total amount', value: money(result.total), emphasis: true },
        ],
        chart: result.rows.map((row) => ({
          label: `Y${row.year}`,
          invested: result.principal,
          value: row.closing,
        })),
        table: {
          columns: ['Year', 'Interest', 'Total'],
          rows: result.rows.map((row) => [`Year ${row.year}`, money(row.interest), money(row.closing)]),
        },
        note: 'Interest is the same every year because it is always charged on the original principal.',
      };
    },
  },

  compound: {
    id: 'compound',
    title: 'Compound Interest',
    short: 'Compound',
    blurb: 'Interest that earns interest',
    icon: 'infinite-outline',
    fields: [
      { key: 'principal', label: 'Principal', kind: 'money', min: 0, max: 50_000_000, step: 10_000, slider: true },
      RATE_FIELD('Rate of interest'),
      YEARS_FIELD,
    ],
    options: [{ key: 'compounding', label: 'Compounding', options: COMPOUNDING_OPTIONS }],
    defaults: { principal: 100_000, rate: 10, years: 5, compounding: 'yearly' },
    compute: (values, currency) => {
      const compounding = str(values, 'compounding', 'yearly') as Exclude<Compounding, 'simple'>;
      const result = calculateCompoundInterest({
        principal: num(values, 'principal'),
        annualRate: num(values, 'rate'),
        years: num(values, 'years', 1),
        compounding,
      });
      const simple = calculateSimpleInterest({
        principal: num(values, 'principal'),
        annualRate: num(values, 'rate'),
        years: num(values, 'years', 1),
      });
      const money = (v: number) => formatMoney(v, { currency });
      return {
        headline: {
          label: 'Total amount',
          value: money(result.total),
          caption: `${money(result.principal)} at ${formatPercent(num(values, 'rate'))}, ${
            COMPOUNDING_LABELS[compounding]
          }`,
        },
        invested: result.principal,
        gain: result.interest,
        investedLabel: 'Principal',
        gainLabel: 'Interest',
        rows: [
          { label: 'Principal', value: money(result.principal), swatch: 'invested' },
          { label: 'Compound interest', value: money(result.interest), tone: 'positive', swatch: 'gain' },
          { label: 'Effective annual rate', value: formatPercent(result.effectiveAnnualRatePct) },
          { label: 'Gain over simple interest', value: money(result.total - simple.total) },
          { label: 'Total amount', value: money(result.total), emphasis: true },
        ],
        chart: result.rows.map((row) => ({
          label: `Y${row.year}`,
          invested: result.principal,
          value: row.closing,
        })),
        table: {
          columns: ['Year', 'Opening', 'Interest', 'Closing'],
          rows: result.rows.map((row) => [
            `Year ${row.year}`,
            money(row.opening),
            money(row.interest),
            money(row.closing),
          ]),
        },
      };
    },
  },

  stp: {
    id: 'stp',
    title: 'STP Calculator',
    short: 'STP',
    blurb: 'Shift a lumpsum into equity a little at a time',
    icon: 'swap-horizontal-outline',
    fields: [
      { key: 'corpus', label: 'Total investment', kind: 'money', min: 0, max: 100_000_000, step: 10_000, slider: true },
      { key: 'monthlyTransfer', label: 'Monthly transfer', kind: 'money', min: 0, max: 1_000_000, step: 500, slider: true },
      {
        key: 'sourceRate',
        label: 'Source fund return',
        kind: 'rate',
        min: 0,
        max: 60,
        step: 0.1,
        slider: true,
        hint: 'Usually a debt/liquid fund',
      },
      {
        key: 'targetRate',
        label: 'Target fund return',
        kind: 'rate',
        min: 0,
        max: 60,
        step: 0.1,
        slider: true,
        hint: 'Usually an equity fund',
      },
      YEARS_FIELD,
    ],
    defaults: { corpus: 1_000_000, monthlyTransfer: 20_000, sourceRate: 6, targetRate: 12, years: 5 },
    compute: (values, currency) => {
      const result = calculateStp({
        totalInvestment: num(values, 'corpus'),
        monthlyTransfer: num(values, 'monthlyTransfer'),
        sourceRate: num(values, 'sourceRate'),
        targetRate: num(values, 'targetRate'),
        years: num(values, 'years', 1),
      });
      const money = (v: number) => formatMoney(v, { currency });
      const rows: ResultRow[] = [
        { label: 'Original corpus', value: money(result.corpus), swatch: 'invested' },
        { label: 'Growth', value: money(result.gain), tone: result.gain >= 0 ? 'positive' : 'negative', swatch: 'gain' },
        { label: 'Transferred to target fund', value: money(result.totalTransferred) },
        { label: 'Source fund balance', value: money(result.sourceValue) },
        { label: 'Target fund balance', value: money(result.targetValue) },
      ];
      if (result.exhausted) {
        rows.push({ label: 'Transfers lasted', value: formatTenure(result.monthsLasted) });
      }
      rows.push({ label: 'Total value', value: money(result.totalValue), emphasis: true });

      return {
        headline: {
          label: 'Total value',
          value: money(result.totalValue),
          caption: `${money(result.corpus)} shifted via ${money(num(values, 'monthlyTransfer'))}/month transfers`,
        },
        invested: result.corpus,
        gain: result.gain,
        investedLabel: 'Corpus',
        gainLabel: 'Growth',
        rows,
        chart: result.rows.map((row) => ({
          label: `Y${row.year}`,
          invested: result.corpus,
          value: row.totalValue,
        })),
        table: {
          columns: ['Year', 'Transferred', 'Source', 'Target', 'Total'],
          rows: result.rows.map((row) => [
            `Year ${row.year}`,
            money(row.transferred),
            money(row.sourceValue),
            money(row.targetValue),
            money(row.totalValue),
          ]),
        },
        note: 'Each month the source fund grows for the month, then the transfer moves out; the target fund grows for the month, then receives it. Exit loads and capital gains tax on each transfer are not modelled.',
        warning: result.exhausted
          ? `The source fund ran out after ${formatTenure(result.monthsLasted)} of transfers.`
          : undefined,
      };
    },
  },

  sip_inflation: {
    id: 'sip_inflation',
    title: 'SIP With Inflation',
    short: 'SIP+Infl',
    blurb: 'A SIP corpus restated in today’s money',
    icon: 'trending-down-outline',
    fields: [
      { key: 'monthly', label: 'Monthly investment', kind: 'money', min: 0, max: 1_000_000, step: 500, slider: true },
      { key: 'rate', label: 'Expected return', kind: 'rate', min: 0, max: 40, step: 0.5, slider: true },
      YEARS_FIELD,
      {
        key: 'inflation',
        label: 'Inflation rate',
        kind: 'rate',
        min: 0,
        max: 20,
        step: 0.1,
        slider: true,
        hint: 'Typically 4–7% in India',
      },
    ],
    defaults: { monthly: 10_000, rate: 12, years: 10, inflation: 6 },
    compute: (values, currency) => {
      const inflation = num(values, 'inflation');
      const years = num(values, 'years', 1);
      const sip = calculateSip({
        monthlyInvestment: num(values, 'monthly'),
        annualRate: num(values, 'rate'),
        years,
      });
      const real = calculateRealValue({ nominalValue: sip.futureValue, inflationRate: inflation, years });
      const realRate = realRateOfReturn(num(values, 'rate'), inflation);
      const gain = real.real - sip.invested;
      const money = (v: number) => formatMoney(v, { currency });

      return {
        headline: {
          label: 'Inflation-adjusted future value',
          value: money(real.real),
          caption: `${money(num(values, 'monthly'))}/month for ${formatTenure(sip.months)} at ${formatPercent(
            inflation,
          )} inflation`,
        },
        invested: sip.invested,
        gain,
        investedLabel: 'Invested',
        gainLabel: 'Real gain',
        rows: [
          { label: 'Total invested', value: money(sip.invested), swatch: 'invested' },
          { label: 'Nominal future value', value: money(sip.futureValue) },
          { label: 'Real gain (after inflation)', value: money(gain), tone: gain >= 0 ? 'positive' : 'negative', swatch: 'gain' },
          { label: 'Inflation-adjusted rate of return', value: formatPercent(realRate, 2) },
          { label: 'Purchasing power lost to inflation', value: money(real.purchasingPowerLost) },
          { label: 'Inflation-adjusted future value', value: money(real.real), emphasis: true },
        ],
        chart: sip.rows.map((row) => ({
          label: `Y${row.year}`,
          invested: row.cumInvested,
          value: calculateRealValue({ nominalValue: row.value, inflationRate: inflation, years: row.year }).real,
        })),
        table: {
          columns: ['Year', 'Invested', 'Nominal', 'Real'],
          rows: sip.rows.map((row) => {
            const r = calculateRealValue({ nominalValue: row.value, inflationRate: inflation, years: row.year });
            return [`Year ${row.year}`, money(row.cumInvested), money(row.value), money(r.real)];
          }),
        },
        note: 'The nominal figure is what your statement will show; the real figure restates it in today’s money using the inflation rate above. Actual inflation varies year to year.',
      };
    },
  },

  inflation: {
    id: 'inflation',
    title: 'Inflation Impact',
    short: 'Inflation',
    blurb: 'What today’s money will cost, or be worth, later',
    icon: 'arrow-up-circle-outline',
    fields: [
      { key: 'amount', label: 'Current amount', kind: 'money', min: 0, max: 100_000_000, step: 10_000, slider: true },
      {
        key: 'inflationRate',
        label: 'Inflation rate',
        kind: 'rate',
        min: 0,
        max: 20,
        step: 0.1,
        slider: true,
        hint: 'Typically 4–7% in India',
      },
      YEARS_FIELD,
    ],
    defaults: { amount: 100_000, inflationRate: 6, years: 10 },
    compute: (values, currency) => {
      const result = calculateInflationImpact({
        amount: num(values, 'amount'),
        inflationRate: num(values, 'inflationRate'),
        years: num(values, 'years', 1),
      });
      const money = (v: number) => formatMoney(v, { currency });
      const extraCost = result.futureCost - result.amount;

      return {
        headline: {
          label: 'Future cost',
          value: money(result.futureCost),
          caption: `what ${money(result.amount)} of today's expenses will cost after ${result.years} years at ${formatPercent(
            num(values, 'inflationRate'),
          )} inflation`,
        },
        invested: result.amount,
        gain: extraCost,
        investedLabel: "Today's value",
        gainLabel: 'Inflation increase',
        rows: [
          { label: "Today's amount", value: money(result.amount), swatch: 'invested' },
          { label: 'Extra cost from inflation', value: money(extraCost), tone: 'warning', swatch: 'gain' },
          { label: 'Future cost', value: money(result.futureCost), emphasis: true },
          { label: 'Purchasing power of this amount later', value: money(result.purchasingPower) },
          { label: 'Value lost', value: formatPercent(result.valueLostPct, 1), tone: 'negative' },
        ],
        chart: result.rows.map((row) => ({
          label: `Y${row.year}`,
          invested: result.amount,
          value: row.futureCost,
        })),
        table: {
          columns: ['Year', 'Future cost', 'Purchasing power'],
          rows: result.rows.map((row) => [`Year ${row.year}`, money(row.futureCost), money(row.purchasingPower)]),
        },
        note: 'Both figures use the same inflation rate: "future cost" is what today’s expenses will cost later, and "purchasing power" is what today’s money will be worth then. Real-world inflation varies year to year and by expense category.',
      };
    },
  },
};

export function isCalculatorId(value: string): value is CalculatorId {
  return (CALCULATOR_IDS as readonly string[]).includes(value);
}
