/**
 * Money formatting. Deliberately hand-rolled rather than `Intl.NumberFormat` so that grouping is
 * identical across Hermes/Node and unit tests stay deterministic.
 */

export type Grouping = 'indian' | 'western';

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  grouping: Grouping;
}

export const CURRENCIES: readonly Currency[] = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', grouping: 'indian' },
  { code: 'USD', symbol: '$', name: 'US Dollar', grouping: 'western' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar', grouping: 'western' },
  { code: 'EUR', symbol: '€', name: 'Euro', grouping: 'western' },
  { code: 'GBP', symbol: '£', name: 'British Pound', grouping: 'western' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', grouping: 'western' },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', grouping: 'western' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', grouping: 'western' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', grouping: 'western' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', grouping: 'western' },
  { code: 'NPR', symbol: 'NPR', name: 'Nepalese Rupee', grouping: 'indian' },
  { code: 'LKR', symbol: 'LKR', name: 'Sri Lankan Rupee', grouping: 'indian' },
  { code: 'PKR', symbol: 'PKR', name: 'Pakistani Rupee', grouping: 'indian' },
  { code: 'BDT', symbol: 'BDT', name: 'Bangladeshi Taka', grouping: 'indian' },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));

export function getCurrency(code: string): Currency {
  return BY_CODE.get(code) ?? CURRENCIES[0]!;
}

/**
 * `₹ INR`, but just `AED` for currencies with no distinct glyph — avoids rendering "AED AED".
 */
export function currencyTag(code: string): string {
  const currency = getCurrency(code);
  return currency.symbol === currency.code ? currency.code : `${currency.symbol} ${currency.code}`;
}

/** `12345678` -> `1,23,45,678` (last 3 digits, then pairs). */
export function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const pairs: string[] = [];
  let i = rest.length;
  while (i > 2) {
    pairs.unshift(rest.slice(i - 2, i));
    i -= 2;
  }
  if (i > 0) pairs.unshift(rest.slice(0, i));
  return `${pairs.join(',')},${last3}`;
}

/** `12345678` -> `12,345,678`. */
export function groupWestern(digits: string): string {
  if (digits.length <= 3) return digits;
  const parts: string[] = [];
  let i = digits.length;
  while (i > 3) {
    parts.unshift(digits.slice(i - 3, i));
    i -= 3;
  }
  parts.unshift(digits.slice(0, i));
  return parts.join(',');
}

export function group(digits: string, grouping: Grouping): string {
  return grouping === 'indian' ? groupIndian(digits) : groupWestern(digits);
}

export interface NumberFormatOptions {
  grouping?: Grouping;
  decimals?: number;
  /** Drop trailing zeros after the point, so 20.00 reads as 20 but 3.50 reads as 3.5. */
  trim?: boolean;
}

/** Groups a number, rounding to `decimals` (default 0). Handles negatives. */
export function formatNumber(value: number, opts: NumberFormatOptions = {}): string {
  const { grouping = 'indian', decimals = 0, trim = false } = opts;
  if (!Number.isFinite(value)) return '—';
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [intPart = '0', fracPart] = fixed.split('.');
  const grouped = group(intPart, grouping);
  const trimmedFrac = trim && fracPart ? fracPart.replace(/0+$/, '') : fracPart;
  const body = trimmedFrac ? `${grouped}.${trimmedFrac}` : grouped;
  return negative ? `-${body}` : body;
}

export interface MoneyFormatOptions extends NumberFormatOptions {
  currency?: string;
  /** Show the currency symbol. Default true. */
  symbol?: boolean;
}

export function formatMoney(value: number, opts: MoneyFormatOptions = {}): string {
  const { currency = 'INR', symbol = true, decimals = 0 } = opts;
  const cur = getCurrency(currency);
  const grouping = opts.grouping ?? cur.grouping;
  const body = formatNumber(value, { grouping, decimals });
  if (!symbol) return body;
  return body.startsWith('-') ? `-${cur.symbol}${body.slice(1)}` : `${cur.symbol}${body}`;
}

const INDIAN_UNITS: ReadonlyArray<[number, string]> = [
  [1e7, 'Cr'],
  [1e5, 'L'],
  [1e3, 'K'],
];

const WESTERN_UNITS: ReadonlyArray<[number, string]> = [
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];

/** Short form for chart labels and dense tables: `12345678` -> `1.23 Cr` / `12.35 M`. */
export function formatCompact(value: number, opts: MoneyFormatOptions = {}): string {
  const { currency = 'INR', symbol = true } = opts;
  const cur = getCurrency(currency);
  const grouping = opts.grouping ?? cur.grouping;
  const units = grouping === 'indian' ? INDIAN_UNITS : WESTERN_UNITS;
  const abs = Math.abs(value);
  const prefix = symbol ? cur.symbol : '';
  const sign = value < 0 ? '-' : '';

  for (const [threshold, suffix] of units) {
    if (abs >= threshold) {
      const scaled = abs / threshold;
      const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      return `${sign}${prefix}${trimZeros(scaled.toFixed(decimals))} ${suffix}`;
    }
  }
  return `${sign}${prefix}${formatNumber(abs, { grouping, decimals: 0 })}`;
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** Percent with at most 2 decimals, trailing zeros trimmed: `8.5` -> `8.5%`. */
export function formatPercent(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return '—';
  return `${trimZeros(value.toFixed(decimals))}%`;
}

/** `26` -> `2 yr 2 mo`. */
export function formatTenure(months: number): string {
  const m = Math.max(0, Math.round(months));
  const years = Math.floor(m / 12);
  const rem = m % 12;
  if (years === 0) return `${rem} mo`;
  if (rem === 0) return `${years} yr`;
  return `${years} yr ${rem} mo`;
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const;

function twoDigitWords(value: number): string {
  if (value < 20) return ONES[value] ?? '';
  const tens = TENS[Math.floor(value / 10)] ?? '';
  const ones = ONES[value % 10] ?? '';
  return ones ? `${tens} ${ones}` : tens;
}

function threeDigitWords(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) parts.push(twoDigitWords(rest));
  return parts.join(' ');
}

/** Indian-system scale groups, largest first: crore, lakh, thousand, then the last three digits. */
const INDIAN_SCALES: ReadonlyArray<[number, string]> = [
  [10_000_000, 'Crore'],
  [100_000, 'Lakh'],
  [1_000, 'Thousand'],
];

const WESTERN_SCALES: ReadonlyArray<[number, string]> = [
  [1_000_000_000, 'Billion'],
  [1_000_000, 'Million'],
  [1_000, 'Thousand'],
];

/**
 * Spells a number out, the way the original app captions its result ("Twenty Five Lakh").
 * Uses the Indian crore/lakh scale for Indian-grouped currencies, billions/millions otherwise.
 * Decimals are dropped — this is a readability aid, not a legal amount.
 */
export function amountToWords(value: number, grouping: Grouping = 'indian'): string {
  if (!Number.isFinite(value)) return '';
  const negative = value < 0;
  let remaining = Math.floor(Math.abs(value));
  if (remaining === 0) return 'Zero';

  const scales = grouping === 'indian' ? INDIAN_SCALES : WESTERN_SCALES;
  const parts: string[] = [];

  for (const [size, name] of scales) {
    if (remaining >= size) {
      const count = Math.floor(remaining / size);
      remaining %= size;
      // Crore can exceed three digits (e.g. 1,00,000 crore), so recurse for that group.
      const countWords = count > 999 ? amountToWords(count, grouping) : threeDigitWords(count);
      parts.push(`${countWords} ${name}`);
    }
  }
  if (remaining > 0) parts.push(threeDigitWords(remaining));

  const words = parts.join(' ').replace(/\s+/g, ' ').trim();
  return negative ? `Minus ${words}` : words;
}

/** Strips grouping/symbols so a formatted string can be parsed back from a text input. */
export function parseNumber(text: string): number {
  const cleaned = text.replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return 0;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}
