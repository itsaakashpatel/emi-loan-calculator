import type { Env } from './env';
import { fetchNavAll } from './lib/amfi';
import { fetchQuotes } from './lib/yahoo';

/**
 * The daily refresh, run by cron at 02:00 UTC — 07:30 IST, after AMFI has
 * published the previous day's NAVs.
 *
 * Both halves refresh only what someone actually holds. AMFI's file lists
 * 40,000+ schemes and writing all of them every night would be almost entirely
 * waste; a portfolio-shaped subset is a few dozen rows.
 *
 * Neither half is allowed to fail the other, and a source being unreachable
 * leaves the previous prices in place. A day-old price is worth far more to
 * someone opening the app than an error.
 */

/** D1 caps how many parameters one statement takes; upserts go in chunks. */
const BATCH_SIZE = 50;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function refreshNavs(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    'SELECT DISTINCT amfi_code FROM mf_holdings',
  ).all<{ amfi_code: string }>();

  const held = new Set(results.map((row) => row.amfi_code));
  if (held.size === 0) return 0;

  const navs = await fetchNavAll(held);
  if (navs.length === 0) return 0;

  const now = new Date().toISOString();
  for (const group of chunk(navs, BATCH_SIZE)) {
    await env.DB.batch(
      group.map((row) =>
        env.DB.prepare(
          `INSERT INTO nav_cache (amfi_code, scheme_name, nav, nav_date, fetched_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(amfi_code) DO UPDATE SET
             scheme_name = excluded.scheme_name, nav = excluded.nav,
             nav_date = excluded.nav_date, fetched_at = excluded.fetched_at`,
        ).bind(row.amfiCode, row.schemeName, row.nav, row.navDate, now),
      ),
    );
  }

  return navs.length;
}

export async function refreshStockPrices(env: Env): Promise<number> {
  const { results } = await env.DB.prepare(
    'SELECT DISTINCT symbol, exchange FROM stock_holdings',
  ).all<{ symbol: string; exchange: string }>();
  if (results.length === 0) return 0;

  // Holdings already store the Yahoo-suffixed ticker, so they are looked up
  // as they are and written back under the same key the join reads.
  const quotes = await fetchQuotes(results.map((row) => row.symbol));
  if (quotes.length === 0) return 0;

  const now = new Date().toISOString();
  for (const group of chunk(quotes, BATCH_SIZE)) {
    await env.DB.batch(
      group.map((quote) =>
        env.DB.prepare(
          `INSERT INTO stock_price_cache (symbol, price, currency, price_date, fetched_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(symbol) DO UPDATE SET
             price = excluded.price, currency = excluded.currency,
             price_date = excluded.price_date, fetched_at = excluded.fetched_at`,
        ).bind(quote.symbol, quote.price, quote.currency, quote.priceDate, now),
      ),
    );
  }

  return quotes.length;
}

export async function runDailyRefresh(env: Env): Promise<void> {
  // Settled, not all: a failing AMFI must not skip the stock refresh.
  const [navs, stocks] = await Promise.allSettled([refreshNavs(env), refreshStockPrices(env)]);

  if (navs.status === 'rejected') console.error('nav refresh failed', navs.reason);
  else console.log(`nav refresh updated ${navs.value} schemes`);

  if (stocks.status === 'rejected') console.error('stock refresh failed', stocks.reason);
  else console.log(`stock refresh updated ${stocks.value} symbols`);
}
