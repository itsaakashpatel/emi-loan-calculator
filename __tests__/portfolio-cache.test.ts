/**
 * Covers the on-device portfolio cache against a real SQLite database, using
 * the same node:sqlite adapter as db.test.ts.
 */

import { DatabaseSync } from 'node:sqlite';

jest.mock('expo-sqlite', () => {
  const { DatabaseSync: Sync } = require('node:sqlite') as typeof import('node:sqlite');

  const wrap = (db: InstanceType<typeof Sync>) => ({
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      const result = db.prepare(sql).run(...(params as never[]));
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      db.prepare(sql).get(...(params as never[])) ?? null,
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      db.prepare(sql).all(...(params as never[])),
    withTransactionAsync: async (fn: () => Promise<void>) => {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  });

  return { openDatabaseAsync: async () => wrap(new Sync(':memory:')) };
});

import { resetDatabase } from '../src/db/client';
import {
  clearCache,
  readCachedMembers,
  readCachedMfHoldings,
  readCachedStockHoldings,
  writeCache,
} from '../src/db/portfolio';
import type { Member, MfHolding, StockHolding } from '../src/lib/api/types';

const MEMBER: Member = {
  id: 'm-1',
  name: 'Aakash',
  relation: 'self',
  hasPan: true,
  sortOrder: 0,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
};

const MF: MfHolding = {
  id: 'h-1',
  memberId: 'm-1',
  amfiCode: '120503',
  schemeName: 'HDFC Flexi Cap Fund - Growth',
  folioNumber: '12345678/90',
  units: 250.5,
  avgNav: 1600,
  currentNav: 1789.456,
  navDate: '2026-08-31',
  source: 'cas',
  invested: 400_800,
  currentValue: 448_258.7,
  gain: 47_458.7,
  gainPct: 11.84,
};

const STOCK: StockHolding = {
  id: 's-1',
  memberId: 'm-1',
  symbol: 'RELIANCE.NS',
  exchange: 'NSE',
  stockName: 'Reliance Industries',
  quantity: 10,
  avgPrice: 2000,
  currentPrice: 2500,
  priceDate: '2026-09-03',
  invested: 20_000,
  currentValue: 25_000,
  gain: 5_000,
  gainPct: 25,
};

beforeEach(async () => {
  await resetDatabase();
});

describe('portfolio cache', () => {
  it('round-trips a portfolio', async () => {
    await writeCache([MEMBER], [MF], [STOCK]);

    const [members, mf, stocks] = await Promise.all([
      readCachedMembers(),
      readCachedMfHoldings(),
      readCachedStockHoldings(),
    ]);

    expect(members).toHaveLength(1);
    expect(members[0]?.name).toBe('Aakash');
    expect(members[0]?.hasPan).toBe(true);

    expect(mf[0]?.schemeName).toBe('HDFC Flexi Cap Fund - Growth');
    expect(mf[0]?.units).toBeCloseTo(250.5, 6);
    expect(mf[0]?.source).toBe('cas');

    expect(stocks[0]?.symbol).toBe('RELIANCE.NS');
    expect(stocks[0]?.currentPrice).toBe(2500);
  });

  it('keeps the computed values, so the screen needs no network call', async () => {
    await writeCache([MEMBER], [MF], [STOCK]);
    const stocks = await readCachedStockHoldings();

    expect(stocks[0]?.invested).toBe(20_000);
    expect(stocks[0]?.currentValue).toBe(25_000);
    expect(stocks[0]?.gain).toBe(5_000);
    expect(stocks[0]?.gainPct).toBe(25);
  });

  it('replaces rather than accumulates, so a deletion elsewhere lands here', async () => {
    await writeCache([MEMBER], [MF], [STOCK]);
    await writeCache([MEMBER], [], [STOCK]);

    expect(await readCachedMfHoldings()).toHaveLength(0);
    expect(await readCachedStockHoldings()).toHaveLength(1);
    expect(await readCachedMembers()).toHaveLength(1);
  });

  it('keeps nulls null rather than turning them into zero', async () => {
    // A scheme the cron has not priced yet.
    await writeCache([MEMBER], [{ ...MF, currentNav: null, navDate: null, avgNav: null }], []);
    const mf = await readCachedMfHoldings();

    expect(mf[0]?.currentNav).toBeNull();
    expect(mf[0]?.navDate).toBeNull();
    expect(mf[0]?.avgNav).toBeNull();
  });

  it('empties everything on sign-out', async () => {
    await writeCache([MEMBER], [MF], [STOCK]);
    await clearCache();

    expect(await readCachedMembers()).toHaveLength(0);
    expect(await readCachedMfHoldings()).toHaveLength(0);
    expect(await readCachedStockHoldings()).toHaveLength(0);
  });

  it('reads back empty before anything is cached', async () => {
    expect(await readCachedMembers()).toEqual([]);
    expect(await readCachedMfHoldings()).toEqual([]);
    expect(await readCachedStockHoldings()).toEqual([]);
  });
});
