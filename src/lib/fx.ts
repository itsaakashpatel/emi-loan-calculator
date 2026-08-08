import { readCachedRates, writeCachedRates } from '../db/fx';

/**
 * Exchange rates from open.er-api.com — free, no API key, updated daily. The last successful
 * response is cached in SQLite so the converter still works offline, labelled with its date.
 */
const ENDPOINT = 'https://open.er-api.com/v6/latest';
const TIMEOUT_MS = 8000;
/** Rates refresh once a day upstream, so anything younger than this is reused as-is. */
const FRESH_FOR_MS = 6 * 60 * 60 * 1000;

export type RatesSource = 'live' | 'cache';

export interface RatesResult {
  base: string;
  rates: Record<string, number>;
  fetchedAt: string;
  source: RatesSource;
}

interface ApiResponse {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
  'error-type'?: string;
}

async function fetchLive(base: string): Promise<RatesResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${ENDPOINT}/${base}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Rate service returned ${response.status}`);
    const data = (await response.json()) as ApiResponse;
    if (data.result !== 'success' || !data.rates) {
      throw new Error(data['error-type'] ?? 'Rate service returned no rates');
    }
    return {
      base: data.base_code ?? base,
      rates: data.rates,
      fetchedAt: new Date().toISOString(),
      source: 'live',
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns rates for `base`, preferring a recent cache, then the network, then any stale cache.
 * Throws only when there is neither a network response nor a cached one.
 */
export async function getRates(base: string, forceRefresh = false): Promise<RatesResult> {
  const cached = await readCachedRates(base).catch(() => null);

  if (!forceRefresh && cached) {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (Number.isFinite(age) && age < FRESH_FOR_MS) {
      return { ...cached, source: 'cache' };
    }
  }

  try {
    const live = await fetchLive(base);
    await writeCachedRates(live.base, live.rates, live.fetchedAt).catch(() => {
      // A cache write failure must not fail the conversion the user asked for.
    });
    return live;
  } catch (error) {
    if (cached) return { ...cached, source: 'cache' };
    throw error instanceof Error ? error : new Error('Could not load exchange rates');
  }
}

export function convert(amount: number, from: string, to: string, rates: Record<string, number>, base: string): number | null {
  const rateOf = (code: string): number | null => {
    if (code === base) return 1;
    const rate = rates[code];
    return typeof rate === 'number' && rate > 0 ? rate : null;
  };
  const fromRate = rateOf(from);
  const toRate = rateOf(to);
  if (fromRate === null || toRate === null) return null;
  // Rates are quoted per unit of `base`, so cross-convert through it.
  return (amount / fromRate) * toRate;
}
