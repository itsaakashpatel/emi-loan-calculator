import { CALCULATORS } from '../src/lib/finance/calculators';
import { calculateInflationImpact, calculateRealValue, calculateStp, realRateOfReturn } from '../src/lib/finance/inflation';
import { calculateSip } from '../src/lib/finance/sip';

describe('STP', () => {
  it('transfers the full monthly amount every month when the source lasts', () => {
    // A large corpus relative to the transfer size and duration, so the source never runs dry.
    const result = calculateStp({
      totalInvestment: 10_000_000,
      monthlyTransfer: 20_000,
      sourceRate: 6,
      targetRate: 12,
      years: 5,
    });
    expect(result.monthsLasted).toBe(60);
    expect(result.exhausted).toBe(false);
    expect(result.totalTransferred).toBeCloseTo(20_000 * 60, 6);
  });

  it('never drives the source balance negative', () => {
    const result = calculateStp({
      totalInvestment: 50_000,
      monthlyTransfer: 20_000,
      sourceRate: 6,
      targetRate: 12,
      years: 3,
    });
    expect(result.sourceValue).toBeGreaterThanOrEqual(0);
    for (const row of result.rows) {
      expect(row.sourceValue).toBeGreaterThanOrEqual(0);
    }
  });

  it('terminates early with the right month count when the transfer exceeds the corpus', () => {
    // The whole corpus (plus a sliver of growth) is swept out in month one.
    const result = calculateStp({
      totalInvestment: 10_000,
      monthlyTransfer: 50_000,
      sourceRate: 6,
      targetRate: 12,
      years: 5,
    });
    expect(result.monthsLasted).toBe(1);
    expect(result.exhausted).toBe(true);
    expect(result.sourceValue).toBeCloseTo(0, 6);
  });

  it('preserves the original corpus when both funds return 0%', () => {
    const result = calculateStp({
      totalInvestment: 1_000_000,
      monthlyTransfer: 20_000,
      sourceRate: 0,
      targetRate: 0,
      years: 5,
    });
    expect(result.totalValue).toBeCloseTo(1_000_000, 6);
    expect(result.gain).toBeCloseTo(0, 6);
  });

  it('grows the target fund beyond the raw amount transferred when its return is positive', () => {
    const result = calculateStp({
      totalInvestment: 10_000_000,
      monthlyTransfer: 20_000,
      sourceRate: 6,
      targetRate: 12,
      years: 5,
    });
    expect(result.targetValue).toBeGreaterThan(result.totalTransferred);
  });
});

describe('inflation impact', () => {
  it('matches a hand-checked case: ₹1,00,000 at 6% for 10 years', () => {
    const result = calculateInflationImpact({ amount: 100_000, inflationRate: 6, years: 10 });
    expect(result.futureCost).toBeCloseTo(179_085, -1);
    expect(result.purchasingPower).toBeCloseTo(55_839, -1);
  });

  it('is a no-op in both directions at 0% inflation', () => {
    const result = calculateInflationImpact({ amount: 50_000, inflationRate: 0, years: 10 });
    expect(result.futureCost).toBeCloseTo(50_000, 6);
    expect(result.purchasingPower).toBeCloseTo(50_000, 6);
    expect(result.valueLostPct).toBeCloseTo(0, 6);
  });

  it('is reciprocal: the growth factor and the discount factor multiply to 1', () => {
    const result = calculateInflationImpact({ amount: 100_000, inflationRate: 7, years: 8 });
    const growthFactor = result.futureCost / result.amount;
    const discountFactor = result.purchasingPower / result.amount;
    expect(growthFactor * discountFactor).toBeCloseTo(1, 6);
  });
});

describe('real value / real rate of return', () => {
  it('is below the nominal value for positive inflation', () => {
    const real = calculateRealValue({ nominalValue: 1_000_000, inflationRate: 6, years: 10 });
    expect(real.real).toBeLessThan(real.nominal);
    expect(real.purchasingPowerLost).toBeGreaterThan(0);
  });

  it('equals the nominal value at 0% inflation', () => {
    const real = calculateRealValue({ nominalValue: 1_000_000, inflationRate: 0, years: 10 });
    expect(real.real).toBeCloseTo(real.nominal, 6);
    expect(real.purchasingPowerLost).toBeCloseTo(0, 6);
  });

  it('matches the Fisher real-rate formula', () => {
    const rate = realRateOfReturn(12, 6);
    expect(rate).toBeCloseTo(((1.12 / 1.06) - 1) * 100, 6);
  });

  it('real rate equals the nominal rate at 0% inflation', () => {
    expect(realRateOfReturn(12, 0)).toBeCloseTo(12, 6);
  });
});

describe('SIP with inflation (registry math)', () => {
  it('discounts the SIP future value down for positive inflation', () => {
    const sip = calculateSip({ monthlyInvestment: 10_000, annualRate: 12, years: 10 });
    const real = calculateRealValue({ nominalValue: sip.futureValue, inflationRate: 6, years: 10 });
    expect(real.real).toBeLessThan(sip.futureValue);
  });

  it('leaves the future value untouched at 0% inflation', () => {
    const sip = calculateSip({ monthlyInvestment: 10_000, annualRate: 12, years: 10 });
    const real = calculateRealValue({ nominalValue: sip.futureValue, inflationRate: 0, years: 10 });
    expect(real.real).toBeCloseTo(sip.futureValue, 6);
  });
});

describe('registry entries', () => {
  for (const id of ['stp', 'sip_inflation', 'inflation'] as const) {
    it(`${id}: computes on its defaults without throwing`, () => {
      const spec = CALCULATORS[id];
      const result = spec.compute(spec.defaults, 'INR');
      expect(typeof result.headline.value).toBe('string');
      expect(result.headline.value.length).toBeGreaterThan(0);
      expect(result.table.rows.length).toBeGreaterThan(0);
    });
  }
});
