import type { Member, MfHolding, StockHolding } from '../lib/api/types';
import { getDb } from './client';

/**
 * The on-device mirror of the cloud portfolio, so the tab draws immediately on
 * launch and keeps working with no network.
 *
 * This is a cache, not a store. The server owns the data; each sync replaces
 * these tables wholesale, which is simpler than reconciling row by row and
 * makes deletions on another device take effect here for free.
 */

interface MemberRow {
  id: string;
  name: string;
  relation: string | null;
  has_pan: number;
  sort_order: number;
}

interface MfRow {
  id: string;
  member_id: string;
  amfi_code: string;
  scheme_name: string;
  folio_number: string | null;
  units: number;
  avg_nav: number | null;
  current_nav: number | null;
  nav_date: string | null;
  source: string;
  invested: number;
  current_value: number;
  gain: number;
  gain_pct: number;
}

interface StockRow {
  id: string;
  member_id: string;
  symbol: string;
  exchange: string;
  stock_name: string;
  quantity: number;
  avg_price: number | null;
  current_price: number | null;
  price_date: string | null;
  invested: number;
  current_value: number;
  gain: number;
  gain_pct: number;
}

export async function readCachedMembers(): Promise<Member[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MemberRow>(
    'SELECT * FROM portfolio_members ORDER BY sort_order, name',
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    relation: row.relation as Member['relation'],
    hasPan: row.has_pan === 1,
    sortOrder: row.sort_order,
    // The cache does not keep timestamps; nothing on screen reads them.
    createdAt: '',
    updatedAt: '',
  }));
}

export async function readCachedMfHoldings(): Promise<MfHolding[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MfRow>(
    'SELECT * FROM portfolio_mf_holdings ORDER BY scheme_name',
  );

  return rows.map((row) => ({
    id: row.id,
    memberId: row.member_id,
    amfiCode: row.amfi_code,
    schemeName: row.scheme_name,
    folioNumber: row.folio_number,
    units: row.units,
    avgNav: row.avg_nav,
    currentNav: row.current_nav,
    navDate: row.nav_date,
    source: row.source as MfHolding['source'],
    invested: row.invested,
    currentValue: row.current_value,
    gain: row.gain,
    gainPct: row.gain_pct,
  }));
}

export async function readCachedStockHoldings(): Promise<StockHolding[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<StockRow>(
    'SELECT * FROM portfolio_stock_holdings ORDER BY stock_name',
  );

  return rows.map((row) => ({
    id: row.id,
    memberId: row.member_id,
    symbol: row.symbol,
    exchange: row.exchange as StockHolding['exchange'],
    stockName: row.stock_name,
    quantity: row.quantity,
    avgPrice: row.avg_price,
    currentPrice: row.current_price,
    priceDate: row.price_date,
    invested: row.invested,
    currentValue: row.current_value,
    gain: row.gain,
    gainPct: row.gain_pct,
  }));
}

/**
 * Replaces the whole cache with what the server just returned. One transaction,
 * so a failure part-way leaves the previous contents rather than a torn mix of
 * old and new.
 */
export async function writeCache(
  members: readonly Member[],
  mfHoldings: readonly MfHolding[],
  stockHoldings: readonly StockHolding[],
): Promise<void> {
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM portfolio_mf_holdings');
    await db.runAsync('DELETE FROM portfolio_stock_holdings');
    await db.runAsync('DELETE FROM portfolio_members');

    for (const member of members) {
      await db.runAsync(
        `INSERT INTO portfolio_members (id, name, relation, has_pan, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        member.id,
        member.name,
        member.relation,
        member.hasPan ? 1 : 0,
        member.sortOrder,
      );
    }

    for (const holding of mfHoldings) {
      await db.runAsync(
        `INSERT INTO portfolio_mf_holdings
           (id, member_id, amfi_code, scheme_name, folio_number, units, avg_nav,
            current_nav, nav_date, source, invested, current_value, gain, gain_pct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        holding.id,
        holding.memberId,
        holding.amfiCode,
        holding.schemeName,
        holding.folioNumber,
        holding.units,
        holding.avgNav,
        holding.currentNav,
        holding.navDate,
        holding.source,
        holding.invested,
        holding.currentValue,
        holding.gain,
        holding.gainPct,
      );
    }

    for (const holding of stockHoldings) {
      await db.runAsync(
        `INSERT INTO portfolio_stock_holdings
           (id, member_id, symbol, exchange, stock_name, quantity, avg_price,
            current_price, price_date, invested, current_value, gain, gain_pct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        holding.id,
        holding.memberId,
        holding.symbol,
        holding.exchange,
        holding.stockName,
        holding.quantity,
        holding.avgPrice,
        holding.currentPrice,
        holding.priceDate,
        holding.invested,
        holding.currentValue,
        holding.gain,
        holding.gainPct,
      );
    }
  });
}

/** Empties the cache. Called on sign-out: this data belongs to that account. */
export async function clearCache(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM portfolio_mf_holdings;
    DELETE FROM portfolio_stock_holdings;
    DELETE FROM portfolio_members;
  `);
}
