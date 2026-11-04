import { describe, expect, it } from 'vitest';

import { parseIsinIndex } from '../src/lib/amfi';
import { groundHoldings, parseCasMarkdown, resolveCasHoldings } from '../src/lib/cas-parser';
import type { Env } from '../src/env';

/**
 * The model is replaced by a stub. These tests do not check that a model can
 * read a statement. They check that a wrong answer cannot get into the
 * portfolio.
 */

const MARKDOWN = `
# CONSOLIDATED ACCOUNT STATEMENT
01-Apr-2026 to 31-Aug-2026

**Folio No: 12345678 / 90**  PAN: ABCDE1234F

## HDFC Flexi Cap Fund - Growth
ISIN: INF179K01YV8

| Date | Transaction | Amount | Units | NAV | Balance |
| --- | --- | --- | --- | --- | --- |
| 01-Apr-2026 | Purchase | 100,000.00 | 62.500 | 1600.00 | 62.500 |
| 01-Jul-2026 | Purchase | 300,000.00 | 188.000 | 1595.74 | 250.500 |

Closing Unit Balance: 250.500
NAV on 31-Aug-2026: INR 1,789.4560
Market Value on 31-Aug-2026: INR 448,254.42

## Aditya Birla Sun Life Liquid Fund - Growth Plan
ISIN: INF209K01YM2

Closing Unit Balance: 124.700
NAV on 31-Aug-2026: INR 412.8000
Market Value on 31-Aug-2026: INR 51,476.16
`;

const AMFI_SAMPLE = `Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date
120503;INF179K01YV8;-;HDFC Flexi Cap Fund - Growth Option;1789.456;31-Aug-2026
119551;INF209K01YM2;INF209K01YN0;Aditya Birla Sun Life Liquid Fund - Growth;412.8;31-Aug-2026
`;

/** A true reading of the markdown above. */
const HONEST = [
  {
    isin: 'INF179K01YV8',
    schemeName: 'HDFC Flexi Cap Fund - Growth',
    folioNumber: '12345678/90',
    units: 250.5,
    marketValue: 448254.42,
    navOnDate: 1789.456,
  },
  {
    isin: 'INF209K01YM2',
    schemeName: 'Aditya Birla Sun Life Liquid Fund - Growth Plan',
    folioNumber: '12345678/90',
    units: 124.7,
    marketValue: 51476.16,
    navOnDate: 412.8,
  },
];

describe('groundHoldings', () => {
  it('keeps a reading that the document supports', () => {
    const { holdings, rejected } = groundHoldings(HONEST, MARKDOWN);

    expect(rejected).toBe(0);
    expect(holdings).toHaveLength(2);
    expect(holdings[0]?.units).toBe(250.5);
    expect(holdings[0]?.marketValue).toBe(448_254.42);
    expect(holdings[1]?.isin).toBe('INF209K01YM2');
  });

  it('drops a holding with invented units', () => {
    // 999.999 is not in the statement.
    const { holdings, rejected } = groundHoldings([{ ...HONEST[0], units: 999.999 }, HONEST[1]], MARKDOWN);

    expect(rejected).toBe(1);
    expect(holdings.map((h) => h.isin)).toEqual(['INF209K01YM2']);
  });

  it('drops a holding with an invented market value', () => {
    const { holdings, rejected } = groundHoldings([{ ...HONEST[0], marketValue: 500_000 }], MARKDOWN);

    expect(holdings).toHaveLength(0);
    expect(rejected).toBe(1);
  });

  it('drops a NAV that is one digit wrong', () => {
    // The dangerous case: the value looks normal.
    const { holdings } = groundHoldings([{ ...HONEST[0], navOnDate: 1789.457 }], MARKDOWN);

    expect(holdings).toHaveLength(0);
  });

  it('drops a scheme that the statement does not mention', () => {
    const invented = {
      ...HONEST[0],
      isin: 'INF999X01ZZ9',
      schemeName: 'Imaginary Growth Fund',
    };
    const { holdings, rejected } = groundHoldings([invented], MARKDOWN);

    expect(holdings).toHaveLength(0);
    expect(rejected).toBe(1);
  });

  it('drops a holding under a folio that is not in the statement', () => {
    const { holdings } = groundHoldings([{ ...HONEST[0], folioNumber: '87654321/11' }], MARKDOWN);

    expect(holdings).toHaveLength(0);
  });

  it('accepts a scheme name that is worded a little differently', () => {
    const { holdings } = groundHoldings(
      [{ ...HONEST[0], schemeName: 'HDFC Flexi Cap Fund (Growth)' }],
      MARKDOWN,
    );

    expect(holdings).toHaveLength(1);
  });

  it('accepts units written with different precision', () => {
    // The statement says 250.500. The value 250.5 is the same number.
    const { holdings } = groundHoldings([{ ...HONEST[0], units: 250.5 }], MARKDOWN);

    expect(holdings[0]?.units).toBe(250.5);
  });

  it('reads numbers that the model returned as formatted strings', () => {
    const { holdings } = groundHoldings(
      [{ ...HONEST[0], units: '250.500', marketValue: '448,254.42' }],
      MARKDOWN,
    );

    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.units).toBe(250.5);
    expect(holdings[0]?.marketValue).toBe(448_254.42);
  });

  it('allows a null market value and NAV', () => {
    const { holdings } = groundHoldings(
      [{ ...HONEST[0], marketValue: null, navOnDate: null }],
      MARKDOWN,
    );

    expect(holdings).toHaveLength(1);
    expect(holdings[0]?.marketValue).toBeNull();
  });

  it('skips a redeemed scheme without counting it as rejected', () => {
    const { holdings, rejected } = groundHoldings([{ ...HONEST[0], units: 0 }], MARKDOWN);

    expect(holdings).toHaveLength(0);
    expect(rejected).toBe(0);
  });

  it('drops a malformed ISIN', () => {
    const { holdings, rejected } = groundHoldings([{ ...HONEST[0], isin: 'NOT-AN-ISIN' }], MARKDOWN);

    expect(holdings).toHaveLength(0);
    expect(rejected).toBe(1);
  });

  it('keeps one row when the model repeats a scheme', () => {
    const { holdings } = groundHoldings([HONEST[0], HONEST[0]], MARKDOWN);

    expect(holdings).toHaveLength(1);
  });

  it('returns nothing for a reply that is not a list', () => {
    expect(groundHoldings(null, MARKDOWN)).toEqual({ holdings: [], rejected: 0 });
    expect(groundHoldings({ holdings: [] }, MARKDOWN)).toEqual({ holdings: [], rejected: 0 });
  });

  it('drops a row that is not an object', () => {
    const { holdings, rejected } = groundHoldings([null, 'text', 7], MARKDOWN);

    expect(holdings).toHaveLength(0);
    expect(rejected).toBe(3);
  });
});

/** Stands in for the AI binding and returns what the test says. */
function envReplying(response: unknown): Env {
  return { AI: { run: async () => ({ response }) } } as unknown as Env;
}

describe('parseCasMarkdown', () => {
  it('reads a JSON string reply', async () => {
    const env = envReplying(JSON.stringify({ holdings: HONEST }));
    const { holdings } = await parseCasMarkdown(env, MARKDOWN);

    expect(holdings).toHaveLength(2);
  });

  it('reads a reply that is already an object', async () => {
    const { holdings } = await parseCasMarkdown(envReplying({ holdings: HONEST }), MARKDOWN);

    expect(holdings).toHaveLength(2);
  });

  it('reads JSON inside a code fence', async () => {
    const fenced = `Here you go:\n\`\`\`json\n${JSON.stringify({ holdings: HONEST })}\n\`\`\``;
    const { holdings } = await parseCasMarkdown(envReplying(fenced), MARKDOWN);

    expect(holdings).toHaveLength(2);
  });

  it('applies the guard to what the model returns', async () => {
    const env = envReplying(JSON.stringify({ holdings: [{ ...HONEST[0], units: 999.999 }] }));
    const { holdings, rejected } = await parseCasMarkdown(env, MARKDOWN);

    expect(holdings).toHaveLength(0);
    expect(rejected).toBe(1);
  });

  it('returns nothing, and does not throw, for an unusable reply', async () => {
    await expect(parseCasMarkdown(envReplying('I cannot help'), MARKDOWN)).resolves.toEqual({
      holdings: [],
      rejected: 0,
    });
  });
});

describe('resolveCasHoldings', () => {
  it('maps ISINs to AMFI codes', () => {
    const resolved = resolveCasHoldings(HONEST, parseIsinIndex(AMFI_SAMPLE));

    expect(resolved[0]?.amfiCode).toBe('120503');
    expect(resolved[1]?.amfiCode).toBe('119551');
  });

  it('keeps the statement name, not the AMFI name', () => {
    const resolved = resolveCasHoldings(HONEST, parseIsinIndex(AMFI_SAMPLE));

    expect(resolved[0]?.schemeName).toBe('HDFC Flexi Cap Fund - Growth');
  });

  it('keeps a holding that AMFI does not list, with a null code', () => {
    const resolved = resolveCasHoldings(HONEST, new Map());

    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.amfiCode).toBeNull();
  });
});

describe('parseIsinIndex', () => {
  it('indexes the growth and the reinvestment ISIN', () => {
    const index = parseIsinIndex(AMFI_SAMPLE);

    expect(index.get('INF209K01YM2')?.amfiCode).toBe('119551');
    expect(index.get('INF209K01YN0')?.amfiCode).toBe('119551');
  });

  it('ignores the placeholder dash', () => {
    expect(parseIsinIndex(AMFI_SAMPLE).has('-')).toBe(false);
  });
});
