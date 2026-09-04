import { Hono } from 'hono';

import type { AppEnv } from '../env';
import { fetchNavAll } from '../lib/amfi';

const MFAPI_SEARCH = 'https://api.mfapi.in/mf/search';

export const prices = new Hono<AppEnv>();

prices.get('/prices/nav', async (c) => {
  const codes = (c.req.query('codes') ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean)
    .slice(0, 200);
  if (codes.length === 0) return c.json({ navs: [] });

  const placeholders = codes.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT amfi_code, scheme_name, nav, nav_date FROM nav_cache WHERE amfi_code IN (${placeholders})`,
  )
    .bind(...codes)
    .all<{ amfi_code: string; scheme_name: string; nav: number; nav_date: string }>();

  const cached = results.map((row) => ({
    amfiCode: row.amfi_code,
    schemeName: row.scheme_name,
    nav: row.nav,
    navDate: row.nav_date,
  }));

  // A scheme added since the last cron run has no cached NAV yet. Pull the
  // file once, keep only the missing codes, and store them so the next
  // request is a plain cache read.
  const missing = codes.filter((code) => !cached.some((row) => row.amfiCode === code));
  if (missing.length > 0) {
    try {
      const fetched = await fetchNavAll(new Set(missing));
      if (fetched.length > 0) {
        const now = new Date().toISOString();
        await c.env.DB.batch(
          fetched.map((row) =>
            c.env.DB.prepare(
              `INSERT INTO nav_cache (amfi_code, scheme_name, nav, nav_date, fetched_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(amfi_code) DO UPDATE SET
                 scheme_name = excluded.scheme_name, nav = excluded.nav,
                 nav_date = excluded.nav_date, fetched_at = excluded.fetched_at`,
            ).bind(row.amfiCode, row.schemeName, row.nav, row.navDate, now),
          ),
        );
        cached.push(...fetched);
      }
    } catch (error) {
      // Whatever is cached still goes back; a live-fetch failure is not fatal.
      console.error('nav backfill failed', error);
    }
  }

  return c.json({ navs: cached });
});

prices.get('/prices/stock', async (c) => {
  const symbols = (c.req.query('symbols') ?? '')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 200);
  if (symbols.length === 0) return c.json({ prices: [] });

  const placeholders = symbols.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT symbol, price, currency, price_date FROM stock_price_cache WHERE symbol IN (${placeholders})`,
  )
    .bind(...symbols)
    .all<{ symbol: string; price: number; currency: string; price_date: string }>();

  return c.json({
    prices: results.map((row) => ({
      symbol: row.symbol,
      price: row.price,
      currency: row.currency,
      priceDate: row.price_date,
    })),
  });
});

prices.get('/schemes/search', async (c) => {
  const query = (c.req.query('q') ?? '').trim();
  if (query.length < 3) return c.json({ schemes: [] });

  try {
    const response = await fetch(`${MFAPI_SEARCH}?q=${encodeURIComponent(query)}`, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return c.json({ schemes: [] });

    const body = (await response.json()) as Array<{ schemeCode: number; schemeName: string }>;
    return c.json({
      schemes: body.slice(0, 40).map((row) => ({
        amfiCode: String(row.schemeCode),
        schemeName: row.schemeName,
      })),
    });
  } catch (error) {
    console.error('scheme search failed', error);
    return c.json({ schemes: [] });
  }
});
