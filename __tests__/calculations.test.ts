/**
 * Integration coverage for the saved-calculations repository, running the real repository code and
 * the real migrations against an in-memory database.
 *
 * `expo-sqlite` is unavailable outside the app, so it is mocked by a thin async adapter over Node's
 * built-in `node:sqlite` — real SQL, real constraints, real `lastInsertRowId`. Mock setup copied
 * verbatim from `__tests__/db.test.ts`.
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
    getAllAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).all(...(params as never[])),
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

  return {
    openDatabaseAsync: async () => wrap(new Sync(':memory:')),
  };
});

import { getDb, resetDatabase } from '../src/db/client';
import {
  clearCalculations,
  deleteCalculation,
  listCalculations,
  saveCalculation,
} from '../src/db/calculations';

beforeEach(async () => {
  await resetDatabase();
});

describe('calculations repository', () => {
  it('round-trips a save and list', async () => {
    const id = await saveCalculation('loan', 'Amount - 25,00,000 (9.50%)', {
      principal: 2_500_000,
      annualRate: 9.5,
      tenureMonths: 96,
    });

    const rows = await listCalculations('loan');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id,
      kind: 'loan',
      title: 'Amount - 25,00,000 (9.50%)',
      inputs: { principal: 2_500_000, annualRate: 9.5, tenureMonths: 96 },
    });
    expect(typeof rows[0]!.createdAt).toBe('string');
  });

  it('lists newest first', async () => {
    await saveCalculation('loan', 'First', { principal: 100 });
    // Ensure distinct timestamps even if the clock resolution is coarse.
    await new Promise((r) => setTimeout(r, 5));
    await saveCalculation('loan', 'Second', { principal: 200 });
    await new Promise((r) => setTimeout(r, 5));
    await saveCalculation('loan', 'Third', { principal: 300 });

    const rows = await listCalculations('loan');
    expect(rows.map((r) => r.title)).toEqual(['Third', 'Second', 'First']);
  });

  it('filters by kind', async () => {
    await saveCalculation('loan', 'Loan calc', { principal: 100 });
    await saveCalculation('eligibility', 'Eligibility calc', { income: 50_000 });

    const loanRows = await listCalculations('loan');
    const eligRows = await listCalculations('eligibility');
    const allRows = await listCalculations();

    expect(loanRows).toHaveLength(1);
    expect(loanRows[0]!.kind).toBe('loan');
    expect(eligRows).toHaveLength(1);
    expect(eligRows[0]!.kind).toBe('eligibility');
    expect(allRows).toHaveLength(2);
  });

  it('de-duplicates an identical consecutive save', async () => {
    const first = await saveCalculation('loan', 'Same', { principal: 100, annualRate: 9 });
    const second = await saveCalculation('loan', 'Same', { principal: 100, annualRate: 9 });

    expect(second).toBe(first);
    const rows = await listCalculations('loan');
    expect(rows).toHaveLength(1);
  });

  it('does not de-duplicate when inputs differ, even with the same title', async () => {
    await saveCalculation('loan', 'Same title', { principal: 100 });
    await saveCalculation('loan', 'Same title', { principal: 200 });

    const rows = await listCalculations('loan');
    expect(rows).toHaveLength(2);
  });

  it('does not de-duplicate across different kinds', async () => {
    await saveCalculation('loan', 'Shared', { principal: 100 });
    await saveCalculation('eligibility', 'Shared', { principal: 100 });

    expect(await listCalculations()).toHaveLength(2);
  });

  it('caps each kind at 50 rows, pruning the oldest', async () => {
    for (let i = 0; i < 55; i += 1) {
      // Vary inputs so nothing is de-duplicated.
      await saveCalculation('loan', `Calc ${i}`, { principal: i });
    }

    const rows = await listCalculations('loan');
    expect(rows).toHaveLength(50);
    // Newest-first: the most recent save is Calc 54, the oldest surviving is Calc 5.
    expect(rows[0]!.title).toBe('Calc 54');
    expect(rows[rows.length - 1]!.title).toBe('Calc 5');
  });

  it('deletes a single row', async () => {
    const id = await saveCalculation('loan', 'To delete', { principal: 100 });
    await saveCalculation('loan', 'To keep', { principal: 200 });

    await deleteCalculation(id);

    const rows = await listCalculations('loan');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe('To keep');
  });

  it('clears calculations for a single kind without touching others', async () => {
    await saveCalculation('loan', 'Loan calc', { principal: 100 });
    await saveCalculation('eligibility', 'Eligibility calc', { income: 100 });

    await clearCalculations('loan');

    expect(await listCalculations('loan')).toHaveLength(0);
    expect(await listCalculations('eligibility')).toHaveLength(1);
  });

  it('clears everything when no kind is given', async () => {
    await saveCalculation('loan', 'Loan calc', { principal: 100 });
    await saveCalculation('eligibility', 'Eligibility calc', { income: 100 });

    await clearCalculations();

    expect(await listCalculations()).toHaveLength(0);
  });

  it('skips a corrupt inputs_json row instead of throwing', async () => {
    const goodId = await saveCalculation('loan', 'Good', { principal: 100 });
    const db = await getDb();
    await db.runAsync(
      "INSERT INTO saved_calculations (kind, title, inputs_json, created_at) VALUES ('loan', 'Corrupt', 'not json{{', ?)",
      new Date().toISOString(),
    );

    const rows = await listCalculations('loan');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(goodId);
  });
});
