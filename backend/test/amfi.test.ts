import { describe, expect, it } from 'vitest';

import { parseAmfiDate, parseNavAll } from '../src/lib/amfi';

// Shaped like the real file: a header, fund-house titles, blank lines, and a
// suspended scheme carrying 'N.A.' instead of a number.
const SAMPLE = `Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Aditya Birla Sun Life Mutual Fund

119551;INF209K01YM2;INF209K01YN0;Aditya Birla Sun Life Banking ETF;123.4567;03-Sep-2026
119552;INF209K01ZZ9;-;Aditya Birla Sun Life Liquid Fund - Growth;401.2;03-Sep-2026

HDFC Mutual Fund

120503;INF179K01YV8;-;HDFC Flexi Cap Fund - Growth;1789.456;03-Sep-2026
999999;-;-;Suspended Scheme;N.A.;03-Sep-2026
`;

describe('parseAmfiDate', () => {
  it('converts AMFI dates to ISO', () => {
    expect(parseAmfiDate('03-Sep-2026')).toBe('2026-09-03');
    expect(parseAmfiDate('3-Jan-2026')).toBe('2026-01-03');
    expect(parseAmfiDate('31-Dec-2025')).toBe('2025-12-31');
  });

  it('rejects anything else', () => {
    expect(parseAmfiDate('2026-09-03')).toBeNull();
    expect(parseAmfiDate('03-Xyz-2026')).toBeNull();
    expect(parseAmfiDate('')).toBeNull();
  });
});

describe('parseNavAll', () => {
  it('reads the data rows and skips the rest', () => {
    const rows = parseNavAll(SAMPLE);

    expect(rows).toHaveLength(3); // header, fund houses, blanks and N.A. all skipped
    expect(rows[0]).toEqual({
      amfiCode: '119551',
      schemeName: 'Aditya Birla Sun Life Banking ETF',
      nav: 123.4567,
      navDate: '2026-09-03',
    });
  });

  it('skips a scheme whose NAV is not a number', () => {
    expect(parseNavAll(SAMPLE).some((row) => row.amfiCode === '999999')).toBe(false);
  });

  it('keeps only the wanted codes', () => {
    const rows = parseNavAll(SAMPLE, new Set(['120503']));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.schemeName).toBe('HDFC Flexi Cap Fund - Growth');
    expect(rows[0]?.nav).toBe(1789.456);
  });

  it('returns nothing for an empty or junk file', () => {
    expect(parseNavAll('')).toEqual([]);
    expect(parseNavAll('nothing here\nor here')).toEqual([]);
  });
});
