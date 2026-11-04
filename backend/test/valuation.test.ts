import { describe, expect, it } from 'vitest';

import { summarise, valueHolding } from '../src/lib/valuation';

describe('valueHolding', () => {
  it('values a holding from its current price', () => {
    const result = valueHolding(100, 10, null, 12.5);
    expect(result.invested).toBe(1_000);
    expect(result.currentValue).toBe(1_250);
    expect(result.gain).toBe(250);
    expect(result.gainPct).toBeCloseTo(25, 6);
  });

  it('prefers a stated invested value over average price times size', () => {
    // A CAS gives the real cost, which includes charges that avg * units misses.
    const result = valueHolding(100, 10, 1_050, 12.5);
    expect(result.invested).toBe(1_050);
    expect(result.gain).toBe(200);
  });

  it('reports a loss as a negative gain', () => {
    const result = valueHolding(50, 20, null, 15);
    expect(result.gain).toBe(-250);
    expect(result.gainPct).toBeCloseTo(-25, 6);
  });

  it('treats an unpriced holding as worth its cost, not zero', () => {
    const result = valueHolding(100, 10, null, null);
    expect(result.currentValue).toBe(1_000);
    expect(result.gain).toBe(0);
    expect(result.gainPct).toBe(0);
  });

  it('reports zero gain when there is no cost basis at all', () => {
    const result = valueHolding(100, null, null, 12.5);
    expect(result.invested).toBe(0);
    expect(result.currentValue).toBe(1_250);
    expect(result.gainPct).toBe(0);
  });
});

describe('summarise', () => {
  it('adds up holdings and recomputes the percentage over the total', () => {
    const total = summarise([
      valueHolding(100, 10, null, 12.5), // 1000 -> 1250
      valueHolding(10, 100, null, 90), // 1000 -> 900
    ]);

    expect(total.invested).toBe(2_000);
    expect(total.currentValue).toBe(2_150);
    expect(total.gain).toBe(150);
    expect(total.gainPct).toBeCloseTo(7.5, 6);
  });

  it('handles an empty portfolio without dividing by zero', () => {
    expect(summarise([])).toEqual({ invested: 0, currentValue: 0, gain: 0, gainPct: 0 });
  });
});
