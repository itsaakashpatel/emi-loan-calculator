import {
  addMonths,
  daysBetween,
  daysInMonth,
  formatDate,
  formatMonthYear,
  monthsBetween,
} from '../src/lib/format/date';
import {
  formatCompact,
  formatMoney,
  formatNumber,
  formatPercent,
  formatTenure,
  getCurrency,
  groupIndian,
  groupWestern,
  parseNumber,
  roundToTotal,
} from '../src/lib/format/money';

describe('Indian digit grouping', () => {
  it('puts the last three digits together, then pairs', () => {
    expect(groupIndian('1')).toBe('1');
    expect(groupIndian('123')).toBe('123');
    expect(groupIndian('1234')).toBe('1,234');
    expect(groupIndian('12345')).toBe('12,345');
    expect(groupIndian('100000')).toBe('1,00,000');
    expect(groupIndian('1234567')).toBe('12,34,567');
    expect(groupIndian('12345678')).toBe('1,23,45,678');
    expect(groupIndian('1234567890')).toBe('1,23,45,67,890');
  });
});

describe('Western digit grouping', () => {
  it('groups in threes', () => {
    expect(groupWestern('123')).toBe('123');
    expect(groupWestern('1234')).toBe('1,234');
    expect(groupWestern('12345678')).toBe('12,345,678');
    expect(groupWestern('1234567890')).toBe('1,234,567,890');
  });
});

describe('formatNumber', () => {
  it('rounds to the requested decimals', () => {
    expect(formatNumber(1234567.891, { decimals: 2 })).toBe('12,34,567.89');
    expect(formatNumber(1234567.891)).toBe('12,34,568');
    expect(formatNumber(1234567.891, { grouping: 'western', decimals: 1 })).toBe('1,234,567.9');
  });

  it('keeps the sign outside the grouping', () => {
    expect(formatNumber(-100000)).toBe('-1,00,000');
  });

  it('degrades gracefully on non-finite input', () => {
    expect(formatNumber(NaN)).toBe('—');
    expect(formatNumber(Infinity)).toBe('—');
  });
});

describe('formatMoney', () => {
  it('uses the currency grouping by default', () => {
    expect(formatMoney(1234567, { currency: 'INR' })).toBe('₹12,34,567');
    expect(formatMoney(1234567, { currency: 'USD' })).toBe('$1,234,567');
    expect(formatMoney(1234567, { currency: 'CAD' })).toBe('CA$1,234,567');
  });

  it('places the symbol before the minus sign is stripped', () => {
    expect(formatMoney(-5000, { currency: 'USD' })).toBe('-$5,000');
  });

  it('can omit the symbol', () => {
    expect(formatMoney(5000, { symbol: false })).toBe('5,000');
  });

  it('falls back to INR for an unknown code', () => {
    expect(getCurrency('XXX').code).toBe('INR');
  });
});

describe('formatCompact', () => {
  it('uses lakh and crore for Indian grouping', () => {
    expect(formatCompact(150000)).toBe('₹1.5 L');
    expect(formatCompact(12345678)).toBe('₹1.23 Cr');
    expect(formatCompact(5000)).toBe('₹5 K');
    expect(formatCompact(999)).toBe('₹999');
  });

  it('uses K/M/B for Western grouping', () => {
    expect(formatCompact(12345678, { currency: 'USD' })).toBe('$12.3 M');
    expect(formatCompact(2500000000, { currency: 'USD' })).toBe('$2.5 B');
  });

  it('keeps negatives readable', () => {
    expect(formatCompact(-150000)).toBe('-₹1.5 L');
  });
});

describe('formatPercent and formatTenure', () => {
  it('trims trailing zeros from percentages', () => {
    expect(formatPercent(8.5)).toBe('8.5%');
    expect(formatPercent(9)).toBe('9%');
    expect(formatPercent(7.125)).toBe('7.13%');
  });

  it('renders tenures in years and months', () => {
    expect(formatTenure(5)).toBe('5 mo');
    expect(formatTenure(12)).toBe('1 yr');
    expect(formatTenure(24)).toBe('2 yr');
    expect(formatTenure(26)).toBe('2 yr 2 mo');
    expect(formatTenure(0)).toBe('0 mo');
  });
});

describe('parseNumber', () => {
  it('reads back a formatted value', () => {
    expect(parseNumber('₹12,34,567.89')).toBeCloseTo(1234567.89, 6);
    expect(parseNumber('')).toBe(0);
    expect(parseNumber('abc')).toBe(0);
    expect(parseNumber('-')).toBe(0);
    expect(parseNumber('8.5%')).toBeCloseTo(8.5, 6);
  });
});

describe('date helpers', () => {
  it('adds months, clamping the day to the target month', () => {
    expect(addMonths('2026-01-15', 1)).toBe('2026-02-15');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // leap year
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-06-10', 240)).toBe('2046-06-10');
  });

  it('counts whole months between dates', () => {
    expect(monthsBetween('2026-01-01', '2026-01-31')).toBe(0);
    expect(monthsBetween('2026-01-01', '2026-07-01')).toBe(6);
    expect(monthsBetween('2026-07-01', '2026-01-01')).toBe(-6);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('formats for display', () => {
    expect(formatMonthYear('2026-08-06')).toBe('Aug 2026');
    expect(formatDate('2026-08-06')).toBe('6 Aug 2026');
  });

  it('measures day gaps across month and year ends', () => {
    expect(daysBetween('2026-08-01', '2026-08-31')).toBe(30);
    expect(daysBetween('2026-08-31', '2026-08-01')).toBe(-30);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('roundToTotal', () => {
  it('keeps the parts adding up to the total', () => {
    // Both parts round up while the total rounds down, so naive rounding is a unit out.
    expect(Math.round(9740.51) + Math.round(42328.93)).toBe(52070);
    expect(roundToTotal(52069.44, [9740.51, 42328.93])).toEqual([9741, 42328]);
  });

  it('gives the residual to the largest part', () => {
    const [small, large] = roundToTotal(100, [0.5, 99.5]);
    expect(small! + large!).toBe(100);
    expect(small).toBe(1);
    expect(large).toBe(99);
  });

  it('leaves exact figures alone', () => {
    expect(roundToTotal(300, [100, 200])).toEqual([100, 200]);
    expect(roundToTotal(0, [0, 0])).toEqual([0, 0]);
  });

  it('handles an empty split', () => {
    expect(roundToTotal(10, [])).toEqual([]);
  });
});
