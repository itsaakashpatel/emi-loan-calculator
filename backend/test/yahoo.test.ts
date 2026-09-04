import { describe, expect, it } from 'vitest';

import { yahooSymbol } from '../src/lib/yahoo';

describe('yahooSymbol', () => {
  it('suffixes by exchange', () => {
    expect(yahooSymbol('RELIANCE', 'NSE')).toBe('RELIANCE.NS');
    expect(yahooSymbol('RELIANCE', 'BSE')).toBe('RELIANCE.BO');
  });

  it('keeps the two listings of one company apart', () => {
    expect(yahooSymbol('TCS', 'NSE')).not.toBe(yahooSymbol('TCS', 'BSE'));
  });

  it('normalises case and stray spacing', () => {
    expect(yahooSymbol('  infy  ', 'NSE')).toBe('INFY.NS');
  });

  it('leaves an already-suffixed symbol alone', () => {
    expect(yahooSymbol('RELIANCE.NS', 'NSE')).toBe('RELIANCE.NS');
    // Re-saving a BSE holding must not become RELIANCE.BO.BO.
    expect(yahooSymbol('RELIANCE.BO', 'BSE')).toBe('RELIANCE.BO');
  });

  it('defaults an unknown exchange to NSE', () => {
    expect(yahooSymbol('SBIN', 'UNKNOWN')).toBe('SBIN.NS');
  });
});
