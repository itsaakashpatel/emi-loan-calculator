import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../env';
import { summarise, valueHolding, type Valued } from '../lib/valuation';

const mfSchema = z.object({
  memberId: z.string().uuid(),
  amfiCode: z.string().min(1).max(20),
  schemeName: z.string().min(1).max(200),
  folioNumber: z.string().max(60).nullish(),
  units: z.number().positive(),
  avgNav: z.number().positive().nullish(),
  investedValue: z.number().nonnegative().nullish(),
});

const stockSchema = z.object({
  memberId: z.string().uuid(),
  symbol: z.string().min(1).max(30),
  exchange: z.enum(['NSE', 'BSE']).default('NSE'),
  stockName: z.string().min(1).max(120),
  quantity: z.number().positive(),
  avgPrice: z.number().positive().nullish(),
  investedValue: z.number().nonnegative().nullish(),
});

interface MfRow {
  id: string;
  member_id: string;
  amfi_code: string;
  scheme_name: string;
  folio_number: string | null;
  units: number;
  avg_nav: number | null;
  invested_value: number | null;
  source: string;
  nav: number | null;
  nav_date: string | null;
}

interface StockRow {
  id: string;
  member_id: string;
  symbol: string;
  exchange: string;
  stock_name: string;
  quantity: number;
  avg_price: number | null;
  invested_value: number | null;
  price: number | null;
  price_date: string | null;
}

const MF_SELECT = `
  SELECT h.*, n.nav, n.nav_date
  FROM mf_holdings h
  LEFT JOIN nav_cache n ON n.amfi_code = h.amfi_code
  WHERE h.user_id = ?`;

const STOCK_SELECT = `
  SELECT h.*, p.price, p.price_date
  FROM stock_holdings h
  LEFT JOIN stock_price_cache p ON p.symbol = h.symbol
  WHERE h.user_id = ?`;

function valueMf(row: MfRow) {
  const valued = valueHolding(row.units, row.avg_nav, row.invested_value, row.nav);
  return {
    id: row.id,
    memberId: row.member_id,
    amfiCode: row.amfi_code,
    schemeName: row.scheme_name,
    folioNumber: row.folio_number,
    units: row.units,
    avgNav: row.avg_nav,
    source: row.source,
    currentNav: row.nav,
    navDate: row.nav_date,
    ...valued,
  };
}

function valueStock(row: StockRow) {
  const valued = valueHolding(row.quantity, row.avg_price, row.invested_value, row.price);
  return {
    id: row.id,
    memberId: row.member_id,
    symbol: row.symbol,
    exchange: row.exchange,
    stockName: row.stock_name,
    quantity: row.quantity,
    avgPrice: row.avg_price,
    currentPrice: row.price,
    priceDate: row.price_date,
    ...valued,
  };
}

/** Reads both holdings tables for a user, optionally narrowed to one member. */
async function loadHoldings(
  db: D1Database,
  userId: string,
  memberId: string | undefined,
): Promise<{ mf: ReturnType<typeof valueMf>[]; stocks: ReturnType<typeof valueStock>[] }> {
  const filter = memberId ? ' AND h.member_id = ?' : '';
  const binds = memberId ? [userId, memberId] : [userId];

  const [mfResult, stockResult] = await Promise.all([
    db
      .prepare(`${MF_SELECT}${filter} ORDER BY h.scheme_name`)
      .bind(...binds)
      .all<MfRow>(),
    db
      .prepare(`${STOCK_SELECT}${filter} ORDER BY h.stock_name`)
      .bind(...binds)
      .all<StockRow>(),
  ]);

  return {
    mf: mfResult.results.map(valueMf),
    stocks: stockResult.results.map(valueStock),
  };
}

/** 404s unless the member exists and belongs to this user. */
async function assertOwnsMember(
  db: D1Database,
  userId: string,
  memberId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT id FROM members WHERE id = ? AND user_id = ?')
    .bind(memberId, userId)
    .first<{ id: string }>();
  return row !== null;
}

export const holdings = new Hono<AppEnv>();

holdings.get('/holdings', async (c) => {
  const { mf, stocks } = await loadHoldings(
    c.env.DB,
    c.get('userId'),
    c.req.query('memberId') || undefined,
  );
  return c.json({ mfHoldings: mf, stockHoldings: stocks });
});

holdings.get('/holdings/summary', async (c) => {
  const userId = c.get('userId');
  const { mf, stocks } = await loadHoldings(c.env.DB, userId, undefined);

  const { results: memberRows } = await c.env.DB.prepare(
    'SELECT id, name FROM members WHERE user_id = ? ORDER BY sort_order, created_at',
  )
    .bind(userId)
    .all<{ id: string; name: string }>();

  const byMember = memberRows.map((member) => {
    const owned: Valued[] = [
      ...mf.filter((row) => row.memberId === member.id),
      ...stocks.filter((row) => row.memberId === member.id),
    ];
    return {
      memberId: member.id,
      name: member.name,
      holdingCount: owned.length,
      ...summarise(owned),
    };
  });

  return c.json({
    total: summarise([...mf, ...stocks]),
    byAssetType: { mutualFunds: summarise(mf), stocks: summarise(stocks) },
    byMember,
  });
});

holdings.post('/holdings/mf', async (c) => {
  const parsed = mfSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const userId = c.get('userId');
  const data = parsed.data;
  if (!(await assertOwnsMember(c.env.DB, userId, data.memberId))) {
    return c.json({ error: 'not_found' }, 404);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await c.env.DB.prepare(
      `INSERT INTO mf_holdings
         (id, member_id, user_id, amfi_code, scheme_name, folio_number, units,
          avg_nav, invested_value, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
    )
      .bind(
        id,
        data.memberId,
        userId,
        data.amfiCode,
        data.schemeName,
        data.folioNumber ?? null,
        data.units,
        data.avgNav ?? null,
        data.investedValue ?? null,
        now,
        now,
      )
      .run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) return c.json({ error: 'already_exists' }, 409);
    throw error;
  }

  return c.json({ id }, 201);
});

holdings.put('/holdings/mf/:id', async (c) => {
  const parsed = mfSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const data = parsed.data;
  const result = await c.env.DB.prepare(
    `UPDATE mf_holdings
     SET scheme_name = ?, folio_number = ?, units = ?, avg_nav = ?, invested_value = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      data.schemeName,
      data.folioNumber ?? null,
      data.units,
      data.avgNav ?? null,
      data.investedValue ?? null,
      new Date().toISOString(),
      c.req.param('id'),
      c.get('userId'),
    )
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

holdings.delete('/holdings/mf/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM mf_holdings WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('userId'))
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

holdings.post('/holdings/stock', async (c) => {
  const parsed = stockSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const userId = c.get('userId');
  const data = parsed.data;
  if (!(await assertOwnsMember(c.env.DB, userId, data.memberId))) {
    return c.json({ error: 'not_found' }, 404);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await c.env.DB.prepare(
      `INSERT INTO stock_holdings
         (id, member_id, user_id, symbol, exchange, stock_name, quantity,
          avg_price, invested_value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        data.memberId,
        userId,
        data.symbol.toUpperCase(),
        data.exchange,
        data.stockName,
        data.quantity,
        data.avgPrice ?? null,
        data.investedValue ?? null,
        now,
        now,
      )
      .run();
  } catch (error) {
    if (String(error).includes('UNIQUE')) return c.json({ error: 'already_exists' }, 409);
    throw error;
  }

  return c.json({ id }, 201);
});

holdings.put('/holdings/stock/:id', async (c) => {
  const parsed = stockSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const data = parsed.data;
  const result = await c.env.DB.prepare(
    `UPDATE stock_holdings
     SET stock_name = ?, quantity = ?, avg_price = ?, invested_value = ?, exchange = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      data.stockName,
      data.quantity,
      data.avgPrice ?? null,
      data.investedValue ?? null,
      data.exchange,
      new Date().toISOString(),
      c.req.param('id'),
      c.get('userId'),
    )
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});

holdings.delete('/holdings/stock/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM stock_holdings WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('userId'))
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
