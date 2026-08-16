/**
 * The everyday calculators on the Other tab: date spans, age, discounts, percentages, tip splits
 * and fuel cost.
 *
 * Nothing here is currency- or country-specific. Dates stay as plain `YYYY-MM-DD` strings, matching
 * the rest of the app, so a span never shifts under a timezone conversion.
 */

import {
  addMonths,
  compareISO,
  daysBetween,
  daysInMonth,
  monthsBetween,
  parseISO,
  toISO,
} from '../format/date';

/* ------------------------------------------------------------- date span ---- */

export interface CalendarSpan {
  years: number;
  months: number;
  days: number;
}

export interface DateSpanResult extends CalendarSpan {
  /** Always positive; `direction` carries the sign. */
  totalDays: number;
  totalWeeks: number;
  /** Days left over once whole weeks are taken out. */
  remainderDays: number;
  /** Whole calendar months in the span. */
  totalMonths: number;
  direction: 'past' | 'future' | 'same';
}

/**
 * Years, months and days between two dates. `from` and `to` may be given in either order.
 *
 * The month count is anchored on `addMonths`, which clamps to the end of a short month, rather than
 * on subtracting the date fields. Subtracting needs a borrow, and a single borrow is not always
 * enough: 31 Jan to 1 Mar leaves the day count negative even after taking February. Anchoring gives
 * the answer a person expects — 31 Jan plus one month is 28 Feb, so the span is 1 month and 1 day —
 * and it matches how the loan schedules already step months.
 */
export function calendarSpan(from: string, to: string): CalendarSpan {
  const [early, late] = compareISO(from, to) <= 0 ? [from, to] : [to, from];

  // `monthsBetween` ignores the day of month, so it can overshoot by one in either direction.
  let months = Math.max(0, monthsBetween(early, late));
  while (months > 0 && compareISO(addMonths(early, months), late) > 0) months -= 1;
  while (compareISO(addMonths(early, months + 1), late) <= 0) months += 1;

  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: daysBetween(addMonths(early, months), late),
  };
}

export function dateSpan(from: string, to: string): DateSpanResult {
  const signedDays = daysBetween(from, to);
  const totalDays = Math.abs(signedDays);
  const span = calendarSpan(from, to);

  return {
    ...span,
    totalDays,
    totalWeeks: Math.floor(totalDays / 7),
    remainderDays: totalDays % 7,
    totalMonths: span.years * 12 + span.months,
    direction: signedDays === 0 ? 'same' : signedDays > 0 ? 'future' : 'past',
  };
}

/* ------------------------------------------------------------------ age ---- */

export interface AgeResult extends CalendarSpan {
  totalDays: number;
  totalMonths: number;
  /** Days until the next birthday; `0` when today is the birthday. */
  daysToNextBirthday: number;
  nextBirthday: string;
  /** True when `birthDate` is later than `on`, which makes every other field meaningless. */
  unborn: boolean;
}

/**
 * Age on a given date, plus the countdown to the next birthday.
 *
 * A 29 February birth date is observed on 28 February in common years, which is the convention most
 * jurisdictions use for age of majority.
 */
export function calculateAge(birthDate: string, on: string): AgeResult {
  if (compareISO(birthDate, on) > 0) {
    return {
      years: 0,
      months: 0,
      days: 0,
      totalDays: 0,
      totalMonths: 0,
      daysToNextBirthday: 0,
      nextBirthday: birthDate,
      unborn: true,
    };
  }

  const span = calendarSpan(birthDate, on);
  const birth = parseISO(birthDate);
  const today = parseISO(on);

  const anniversaryIn = (year: number) =>
    toISO({ year, month: birth.month, day: Math.min(birth.day, daysInMonth(year, birth.month)) });

  const thisYear = anniversaryIn(today.year);
  const nextBirthday = compareISO(thisYear, on) >= 0 ? thisYear : anniversaryIn(today.year + 1);

  return {
    ...span,
    totalDays: daysBetween(birthDate, on),
    totalMonths: span.years * 12 + span.months,
    daysToNextBirthday: daysBetween(on, nextBirthday),
    nextBirthday,
    unborn: false,
  };
}

/* ------------------------------------------------------------- discount ---- */

export interface DiscountResult {
  /** Price before any discount. */
  listPrice: number;
  /** Money taken off. */
  savings: number;
  finalPrice: number;
  /** Effective discount as a percentage of the list price. */
  effectivePct: number;
}

/**
 * Applies up to two successive discounts. A second discount is taken off the already-reduced price,
 * which is how "extra 10% off sale items" actually works — 50% then 10% is 55% off, not 60%.
 */
export function applyDiscount(
  listPrice: number,
  discountPct: number,
  extraPct = 0,
): DiscountResult {
  const price = Math.max(0, listPrice);
  const first = clampPct(discountPct);
  const second = clampPct(extraPct);

  const afterFirst = price * (1 - first / 100);
  const finalPrice = afterFirst * (1 - second / 100);
  const savings = price - finalPrice;

  return {
    listPrice: price,
    savings,
    finalPrice,
    effectivePct: price === 0 ? 0 : (savings / price) * 100,
  };
}

/** The discount percentage implied by a list price and the price actually paid. */
export function discountFromPrices(listPrice: number, finalPrice: number): number {
  if (listPrice <= 0) return 0;
  return ((listPrice - finalPrice) / listPrice) * 100;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/* ----------------------------------------------------------- percentage ---- */

export type PercentMode = 'of' | 'is_what' | 'change';

export interface PercentResult {
  value: number;
  /** `true` when the inputs cannot produce an answer, e.g. a zero base. */
  undefinedResult: boolean;
}

/**
 * The three questions a percentage calculator is actually asked:
 * - `of`      — what is A% of B?
 * - `is_what` — A is what percent of B?
 * - `change`  — what is the percentage change from A to B?
 */
export function calculatePercent(mode: PercentMode, a: number, b: number): PercentResult {
  if (mode === 'of') return { value: (a / 100) * b, undefinedResult: false };
  if (b === 0 && mode === 'is_what') return { value: 0, undefinedResult: true };
  if (a === 0 && mode === 'change') return { value: 0, undefinedResult: true };
  if (mode === 'is_what') return { value: (a / b) * 100, undefinedResult: false };
  return { value: ((b - a) / Math.abs(a)) * 100, undefinedResult: false };
}

/* ------------------------------------------------------------------ tip ---- */

export interface TipResult {
  tip: number;
  total: number;
  perPerson: number;
  tipPerPerson: number;
  /** Money added on top of the split by rounding, `0` when rounding is off. */
  roundingAdded: number;
}

/**
 * Splits a bill. `roundUpPerPerson` rounds each share up to the next whole unit, which is what
 * people do at the table; the extra lands in the tip rather than vanishing.
 */
export function splitBill(
  bill: number,
  tipPct: number,
  people: number,
  roundUpPerPerson = false,
): TipResult {
  const amount = Math.max(0, bill);
  const pct = Math.max(0, tipPct);
  const heads = Math.max(1, Math.floor(people));

  const tip = amount * (pct / 100);
  const total = amount + tip;
  const exactShare = total / heads;
  const perPerson = roundUpPerPerson ? Math.ceil(exactShare) : exactShare;
  const roundingAdded = perPerson * heads - total;

  return {
    tip: tip + roundingAdded,
    total: perPerson * heads,
    perPerson,
    tipPerPerson: (tip + roundingAdded) / heads,
    roundingAdded,
  };
}

/* ----------------------------------------------------------------- fuel ---- */

/** How the vehicle's efficiency is quoted. Each choice fixes the distance and volume units. */
export type FuelEfficiencyUnit = 'km_per_l' | 'l_per_100km' | 'mpg';

export interface FuelUnits {
  distance: 'km' | 'mi';
  volume: 'L' | 'gal';
}

export function fuelUnits(unit: FuelEfficiencyUnit): FuelUnits {
  return unit === 'mpg' ? { distance: 'mi', volume: 'gal' } : { distance: 'km', volume: 'L' };
}

export interface FuelCostResult {
  /** Distance actually driven, doubled when the trip is a return journey. */
  distance: number;
  volume: number;
  totalCost: number;
  costPerDistance: number;
  units: FuelUnits;
  /** `true` when the efficiency is zero or negative, so nothing can be computed. */
  invalidEfficiency: boolean;
}

export function fuelCost({
  distance,
  efficiency,
  unit,
  pricePerVolume,
  roundTrip = false,
}: {
  distance: number;
  efficiency: number;
  unit: FuelEfficiencyUnit;
  pricePerVolume: number;
  roundTrip?: boolean;
}): FuelCostResult {
  const units = fuelUnits(unit);
  const travelled = Math.max(0, distance) * (roundTrip ? 2 : 1);
  const price = Math.max(0, pricePerVolume);

  if (efficiency <= 0) {
    return { distance: travelled, volume: 0, totalCost: 0, costPerDistance: 0, units, invalidEfficiency: true };
  }

  // l/100km is consumption, not efficiency, so it multiplies where the others divide.
  const volume = unit === 'l_per_100km' ? (travelled / 100) * efficiency : travelled / efficiency;
  const totalCost = volume * price;

  return {
    distance: travelled,
    volume,
    totalCost,
    costPerDistance: travelled === 0 ? 0 : totalCost / travelled,
    units,
    invalidEfficiency: false,
  };
}
