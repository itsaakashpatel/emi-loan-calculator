/**
 * Date helpers for installment schedules. Dates are handled as plain `YYYY-MM-DD` strings so that
 * schedules never shift under timezone conversion.
 */

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export interface YMD {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function todayISO(): string {
  const now = new Date();
  return toISO({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

export function toISO({ year, month, day }: YMD): string {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function parseISO(iso: string): YMD {
  const [y, m, d] = iso.split('-');
  return { year: Number(y) || 1970, month: Number(m) || 1, day: Number(d) || 1 };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Adds days, keeping the calendar date so it never shifts under timezone conversion. */
export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseISO(iso);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return toISO({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() });
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1mo -> Feb 28). */
export function addMonths(iso: string, months: number): string {
  const { year, month, day } = parseISO(iso);
  const zeroBased = year * 12 + (month - 1) + months;
  const newYear = Math.floor(zeroBased / 12);
  const newMonth = (zeroBased % 12) + 1;
  return toISO({ year: newYear, month: newMonth, day: Math.min(day, daysInMonth(newYear, newMonth)) });
}

/** Whole months from `a` to `b`, ignoring day-of-month. Negative if `b` precedes `a`. */
export function monthsBetween(a: string, b: string): number {
  const x = parseISO(a);
  const y = parseISO(b);
  return (y.year - x.year) * 12 + (y.month - x.month);
}

/** `2026-08-06` -> `Aug 2026`. */
export function formatMonthYear(iso: string): string {
  const { year, month } = parseISO(iso);
  return `${MONTHS_SHORT[month - 1] ?? '???'} ${year}`;
}

/** `2026-08-06` -> `6 Aug 2026`. */
export function formatDate(iso: string): string {
  const { year, month, day } = parseISO(iso);
  return `${day} ${MONTHS_SHORT[month - 1] ?? '???'} ${year}`;
}

export function monthShort(month: number): string {
  return MONTHS_SHORT[month - 1] ?? '???';
}

/** `0` -> "the same month", `1` -> "1 month later", `4` -> "4 months later". */
export function describeMonthGap(months: number): string {
  if (months <= 0) return 'the same month';
  return months === 1 ? '1 month later' : `${months} months later`;
}

export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Signed day difference b - a. Used for "overdue by N days". */
export function daysBetween(a: string, b: string): number {
  const x = parseISO(a);
  const y = parseISO(b);
  const ms = Date.UTC(y.year, y.month - 1, y.day) - Date.UTC(x.year, x.month - 1, x.day);
  return Math.round(ms / 86_400_000);
}
