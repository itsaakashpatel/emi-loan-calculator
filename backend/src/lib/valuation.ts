/**
 * Turns a holding plus its latest price into the numbers the app shows.
 * Pure arithmetic — no D1, no fetch — so it is straightforward to test.
 */

export interface Valued {
  invested: number;
  currentValue: number;
  gain: number;
  gainPct: number;
}

/**
 * `invested` is what the holding cost. Rows imported from a CAS carry it
 * directly; rows typed in by hand may only have an average price, so fall
 * back to price times size. Either can be missing, and a holding with no
 * cost basis is reported as zero gain rather than a fabricated one.
 */
export function valueHolding(
  size: number,
  avgPrice: number | null,
  investedValue: number | null,
  currentPrice: number | null,
): Valued {
  const invested = investedValue ?? (avgPrice === null ? 0 : avgPrice * size);
  // No price yet (a scheme the cron has not reached) is worth its cost, not
  // zero — showing a 100% loss on a fresh holding would be alarming nonsense.
  const currentValue = currentPrice === null ? invested : currentPrice * size;
  const gain = currentValue - invested;

  return {
    invested,
    currentValue,
    gain,
    gainPct: invested > 0 ? (gain / invested) * 100 : 0,
  };
}

export function summarise(rows: readonly Valued[]): Valued {
  const invested = rows.reduce((total, row) => total + row.invested, 0);
  const currentValue = rows.reduce((total, row) => total + row.currentValue, 0);
  const gain = currentValue - invested;

  return {
    invested,
    currentValue,
    gain,
    gainPct: invested > 0 ? (gain / invested) * 100 : 0,
  };
}
