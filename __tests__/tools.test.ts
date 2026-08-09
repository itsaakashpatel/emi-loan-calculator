import { compareLoans, type ComparisonScenario } from '../src/lib/finance/compare';
import { calculateGst } from '../src/lib/finance/gst';

describe('GST', () => {
  it('adds GST to a base amount', () => {
    const result = calculateGst({ amount: 1_000, ratePct: 18, mode: 'add' });
    expect(result.base).toBeCloseTo(1_000, 6);
    expect(result.gst).toBeCloseTo(180, 6);
    expect(result.total).toBeCloseTo(1_180, 6);
    expect(result.cgst).toBeCloseTo(90, 6);
    expect(result.sgst).toBeCloseTo(90, 6);
    expect(result.igst).toBe(0);
  });

  it('strips GST out of an inclusive amount', () => {
    const result = calculateGst({ amount: 1_180, ratePct: 18, mode: 'remove' });
    expect(result.base).toBeCloseTo(1_000, 6);
    expect(result.gst).toBeCloseTo(180, 6);
    expect(result.total).toBeCloseTo(1_180, 6);
  });

  it('round-trips add then remove', () => {
    const added = calculateGst({ amount: 4_567.89, ratePct: 12, mode: 'add' });
    const removed = calculateGst({ amount: added.total, ratePct: 12, mode: 'remove' });
    expect(removed.base).toBeCloseTo(4_567.89, 6);
  });

  it('puts the whole tax in IGST for inter-state supply', () => {
    const result = calculateGst({ amount: 1_000, ratePct: 28, mode: 'add', split: 'igst' });
    expect(result.igst).toBeCloseTo(280, 6);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });

  it('is a no-op at 0%', () => {
    const result = calculateGst({ amount: 500, ratePct: 0, mode: 'add' });
    expect(result.gst).toBe(0);
    expect(result.total).toBeCloseTo(500, 6);
  });
});

describe('loan comparison', () => {
  const scenarios: ComparisonScenario[] = [
    { id: 'a', label: 'Bank A', principal: 1_000_000, annualRate: 8.5, tenureMonths: 240 },
    { id: 'b', label: 'Bank B', principal: 1_000_000, annualRate: 9.25, tenureMonths: 240 },
    { id: 'c', label: 'Bank C', principal: 1_000_000, annualRate: 8.5, tenureMonths: 180 },
  ];

  it('picks the lowest total outflow, not the lowest EMI', () => {
    const { entries, bestId, maxSaving } = compareLoans(scenarios);
    // The 15-year loan has the highest EMI but the lowest total cost.
    expect(bestId).toBe('c');
    const best = entries.find((e) => e.id === 'c')!;
    const cheapestEmi = entries.reduce((min, e) => Math.min(min, e.result.emi), Infinity);
    expect(best.result.emi).toBeGreaterThan(cheapestEmi);
    expect(best.extraCost).toBe(0);
    expect(best.isBest).toBe(true);
    expect(maxSaving).toBeGreaterThan(0);
  });

  it('reports each scenario extra cost and EMI delta against the winner', () => {
    const { entries } = compareLoans(scenarios);
    const b = entries.find((e) => e.id === 'b')!;
    const c = entries.find((e) => e.id === 'c')!;
    expect(b.extraCost).toBeCloseTo(b.result.totalPayment - c.result.totalPayment, 6);
    expect(b.emiDelta).toBeCloseTo(b.result.emi - c.result.emi, 6);
    expect(b.extraCost).toBeGreaterThan(0);
    expect(b.emiDelta).toBeLessThan(0); // cheaper monthly, dearer overall
  });

  it('counts processing fees in the ranking', () => {
    const { bestId } = compareLoans([
      { id: 'low-rate-high-fee', label: 'A', principal: 100_000, annualRate: 10, tenureMonths: 12, fees: 20_000 },
      { id: 'high-rate-no-fee', label: 'B', principal: 100_000, annualRate: 12, tenureMonths: 12 },
    ]);
    expect(bestId).toBe('high-rate-no-fee');
  });

  it('handles an empty set', () => {
    expect(compareLoans([])).toEqual({ entries: [], bestId: null, maxSaving: 0 });
  });
});
