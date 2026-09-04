import { describe, expect, it } from 'vitest';

import { parseIsinIndex } from '../src/lib/amfi';
import { parseCasText, resolveCasHoldings } from '../src/lib/cas-parser';

// Shaped like text pulled out of a real CAS: two folios, three schemes, one of
// them fully redeemed, plus the headers and disclaimers that surround them.
const SAMPLE = `
CONSOLIDATED ACCOUNT STATEMENT
CAMS/KFintech · 01-Apr-2026 to 31-Aug-2026

Folio No: 12345678 / 90    PAN: ABCDE1234F   KYC: OK

HDFC Flexi Cap Fund - Growth (Advisor: DIRECT)
ISIN: INF179K01YV8    Registrar : CAMS
Opening Unit Balance: 0.000
Date        Transaction      Amount        Units      NAV       Balance
01-Apr-2026 Purchase         100,000.00    62.500     1600.00   62.500
01-Jul-2026 Purchase         300,000.00    188.000    1595.74   250.500
Closing Unit Balance: 250.500
NAV on 31-Aug-2026: INR 1,789.4560
Market Value on 31-Aug-2026: INR 448,254.42

Aditya Birla Sun Life Liquid Fund - Growth Plan
ISIN: INF209K01YM2
Opening Unit Balance: 0.000
01-May-2026 Purchase         50,000.00     124.700    401.00    124.700
Closing Unit Balance: 124.700
NAV on 31-Aug-2026: INR 412.8000
Market Value on 31-Aug-2026: INR 51,476.16

Folio No: 87654321 / 11    PAN: ABCDE1234F

SBI Small Cap Fund - Regular Plan
ISIN: INF200K01YZ1
Opening Unit Balance: 40.000
10-Jun-2026 Redemption      -60,000.00    -40.000    1500.00   0.000
Closing Unit Balance: 0.000
NAV on 31-Aug-2026: INR 1,520.0000

This statement is for information purposes only.
Page 1 of 1
`;

const AMFI_SAMPLE = `Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
120503;INF179K01YV8;-;HDFC Flexi Cap Fund - Growth Option;1789.456;31-Aug-2026
119551;INF209K01YM2;INF209K01YN0;Aditya Birla Sun Life Liquid Fund - Growth;412.8;31-Aug-2026
`;

/**
 * What extraction actually returns: one line. Page line breaks are drawing
 * instructions, not characters, so they do not survive. The parser must read
 * this as well as the laid-out form above.
 */
const FLATTENED = SAMPLE.replace(/\s+/g, ' ').trim();

describe('parseCasText', () => {
  const holdings = parseCasText(SAMPLE);

  it('reads the schemes that still hold units', () => {
    expect(holdings).toHaveLength(2);
    expect(holdings.map((h) => h.isin)).toEqual(['INF179K01YV8', 'INF209K01YM2']);
  });

  it('takes units from the closing balance, not a transaction row', () => {
    expect(holdings[0]?.units).toBe(250.5);
    expect(holdings[1]?.units).toBe(124.7);
  });

  it('reads values with thousands separators', () => {
    expect(holdings[0]?.marketValue).toBe(448_254.42);
    expect(holdings[0]?.navOnDate).toBe(1_789.456);
  });

  it('drops a fully redeemed scheme', () => {
    expect(holdings.some((h) => h.isin === 'INF200K01YZ1')).toBe(false);
  });

  it('attaches each scheme to the folio it sits under', () => {
    expect(holdings[0]?.folioNumber).toBe('12345678/90');
    expect(holdings[1]?.folioNumber).toBe('12345678/90');
  });

  it('cleans the advisor tag out of the scheme name', () => {
    expect(holdings[0]?.schemeName).toBe('HDFC Flexi Cap Fund - Growth');
  });

  it('returns nothing for text that is not a statement', () => {
    expect(parseCasText('')).toEqual([]);
    expect(parseCasText('Dear investor,\nThank you for your business.')).toEqual([]);
  });

  it('reads the same holdings when every line break is gone', () => {
    expect(parseCasText(FLATTENED)).toEqual(holdings);
  });

  it('skips a scheme whose closing balance cannot be read', () => {
    const damaged = SAMPLE.replace('Closing Unit Balance: 250.500', 'Closing Unit Balance:');
    expect(parseCasText(damaged)).toHaveLength(1);
  });

  it('keeps one row when a scheme repeats within a folio', () => {
    const repeated = SAMPLE.replace(
      'Folio No: 87654321 / 11    PAN: ABCDE1234F',
      `HDFC Flexi Cap Fund - Growth
ISIN: INF179K01YV8
Closing Unit Balance: 250.500
NAV on 31-Aug-2026: INR 1,789.4560

Folio No: 87654321 / 11    PAN: ABCDE1234F`,
    );
    expect(parseCasText(repeated).filter((h) => h.isin === 'INF179K01YV8')).toHaveLength(1);
  });
});

describe('resolveCasHoldings', () => {
  it('maps ISINs to AMFI codes', () => {
    const resolved = resolveCasHoldings(parseCasText(SAMPLE), parseIsinIndex(AMFI_SAMPLE));

    expect(resolved[0]?.amfiCode).toBe('120503');
    expect(resolved[1]?.amfiCode).toBe('119551');
  });

  it('keeps the statement wording, not AMFI phrasing', () => {
    const resolved = resolveCasHoldings(parseCasText(SAMPLE), parseIsinIndex(AMFI_SAMPLE));
    expect(resolved[0]?.schemeName).toBe('HDFC Flexi Cap Fund - Growth');
  });

  it('keeps a holding whose ISIN AMFI does not list, with a null code', () => {
    const resolved = resolveCasHoldings(parseCasText(SAMPLE), new Map());

    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.amfiCode).toBeNull();
  });
});

describe('parseIsinIndex', () => {
  it('indexes both the growth and reinvestment ISINs', () => {
    const index = parseIsinIndex(AMFI_SAMPLE);

    expect(index.get('INF209K01YM2')?.amfiCode).toBe('119551');
    expect(index.get('INF209K01YN0')?.amfiCode).toBe('119551');
  });

  it('ignores the placeholder dash', () => {
    expect(parseIsinIndex(AMFI_SAMPLE).has('-')).toBe(false);
  });
});
