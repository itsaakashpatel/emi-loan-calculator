import { getDb } from './client';

export interface CachedRates {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
}

export async function readCachedRates(base: string): Promise<CachedRates | null> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ quote: string; rate: number; fetched_at: string }>(
    'SELECT quote, rate, fetched_at FROM fx_rates WHERE base = ?',
    base,
  );
  if (rows.length === 0) return null;
  return {
    base,
    rates: Object.fromEntries(rows.map((r) => [r.quote, r.rate])),
    fetchedAt: rows[0]!.fetched_at,
  };
}

export async function writeCachedRates(base: string, rates: Record<string, number>, fetchedAt: string): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM fx_rates WHERE base = ?', base);
    for (const [quote, rate] of Object.entries(rates)) {
      await db.runAsync(
        'INSERT INTO fx_rates (base, quote, rate, fetched_at) VALUES (?, ?, ?, ?)',
        base,
        quote,
        rate,
        fetchedAt,
      );
    }
  });
}
