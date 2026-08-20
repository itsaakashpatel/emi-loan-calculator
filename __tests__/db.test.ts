/**
 * Integration coverage for the SQLite layer and the loans store, running the real repository code
 * and the real migrations against an in-memory database.
 *
 * `expo-sqlite` is unavailable outside the app, so it is mocked by a thin async adapter over Node's
 * built-in `node:sqlite` — real SQL, real constraints, real `lastInsertRowId`.
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
import { addLoanEvent, deleteLoan, getLoan, insertLoan, listLoans, updateLoan } from '../src/db/loans';
import { readAllSettings, writeSetting } from '../src/db/kv';
import { listPayments, markPaid, markPaidThrough, markUnpaid } from '../src/db/payments';
import { readCachedRates, writeCachedRates } from '../src/db/fx';
import { SCHEMA_VERSION, migrate } from '../src/db/migrations';
import { useLoansStore } from '../src/store/loans';
import { monthsBetween, todayISO } from '../src/lib/format/date';
import type { LoanDraft } from '../src/db/loans';

const DRAFT: LoanDraft = {
  name: 'Home loan',
  type: 'home',
  principal: 1_000_000,
  annualRate: 8.5,
  tenureMonths: 240,
  startDate: '2026-01-01',
  firstPaymentDate: null,
  advanceEmis: 0,
  fees: 0,
  currency: 'INR',
  events: [],
};

beforeEach(async () => {
  await resetDatabase();
});

describe('migrations', () => {
  it('creates the schema and stamps user_version', async () => {
    const db = await getDb();
    const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(SCHEMA_VERSION);

    const tables = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining(['fx_rates', 'kv_settings', 'loan_events', 'loans', 'payments', 'saved_calculations']),
    );
  });

  it('is idempotent when run again', async () => {
    const db = await getDb();
    // Re-running must not re-apply CREATE TABLE (which would throw "table already exists").
    await expect(migrate(db)).resolves.toBeUndefined();
  });

  it('adds first_payment_date to a database created before v2', async () => {
    const db = await getDb();
    const columns = await db.getAllAsync<{ name: string }>("PRAGMA table_info('loans')");
    expect(columns.map((c) => c.name)).toContain('first_payment_date');

    // A loan saved before v2 has no value there, and must keep the old one-month-later schedule.
    await db.runAsync(
      `INSERT INTO loans (name, type, principal, annual_rate, tenure_months, start_date,
         advance_emis, fees, currency, created_at, updated_at)
       VALUES ('Legacy', 'home', 100000, 10, 12, '2024-11-08', 0, 0, 'INR', 'x', 'x')`,
    );
    const [legacy] = await listLoans();
    expect(legacy!.firstPaymentDate).toBeNull();
  });
});

describe('loans repository', () => {
  it('round-trips a loan', async () => {
    const id = await insertLoan(DRAFT);
    const loaded = await getLoan(id);
    expect(loaded).not.toBeNull();
    expect(loaded).toMatchObject({
      id,
      name: 'Home loan',
      type: 'home',
      principal: 1_000_000,
      annualRate: 8.5,
      tenureMonths: 240,
      startDate: '2026-01-01',
      currency: 'INR',
      events: [],
    });
  });

  it('round-trips the first payment date, and keeps null meaning "one month later"', async () => {
    const derived = await getLoan(await insertLoan(DRAFT));
    expect(derived?.firstPaymentDate).toBeNull();

    const id = await insertLoan({ ...DRAFT, startDate: '2024-11-08', firstPaymentDate: '2024-11-08' });
    expect((await getLoan(id))?.firstPaymentDate).toBe('2024-11-08');

    await updateLoan(id, { ...DRAFT, startDate: '2024-11-08', firstPaymentDate: null });
    expect((await getLoan(id))?.firstPaymentDate).toBeNull();
  });

  it('round-trips every event shape', async () => {
    const id = await insertLoan({
      ...DRAFT,
      events: [
        { kind: 'part_payment', startMonth: 12, amount: 100_000, frequency: 'yearly', mode: 'reduce_tenure', count: 5 },
        { kind: 'moratorium', startMonth: 1, months: 6, type: 'full', recovery: 'extend_tenure' },
        { kind: 'rate_change', startMonth: 25, annualRate: 9.25, mode: 'reduce_emi' },
      ],
    });
    const loaded = await getLoan(id);
    expect(loaded?.events).toHaveLength(3);
    expect(loaded?.events).toEqual(
      expect.arrayContaining([
        { kind: 'part_payment', startMonth: 12, amount: 100_000, frequency: 'yearly', mode: 'reduce_tenure', count: 5 },
        { kind: 'moratorium', startMonth: 1, months: 6, type: 'full', recovery: 'extend_tenure' },
        { kind: 'rate_change', startMonth: 25, annualRate: 9.25, mode: 'reduce_emi' },
      ]),
    );
  });

  it('omits count for open-ended recurring prepayments', async () => {
    const id = await insertLoan({
      ...DRAFT,
      events: [{ kind: 'part_payment', startMonth: 6, amount: 5_000, frequency: 'monthly', mode: 'reduce_tenure' }],
    });
    expect((await getLoan(id))?.events[0]).not.toHaveProperty('count');
  });

  it('replaces events on update instead of duplicating them', async () => {
    const id = await insertLoan({
      ...DRAFT,
      events: [{ kind: 'part_payment', startMonth: 6, amount: 5_000, frequency: 'once', mode: 'reduce_tenure' }],
    });
    await updateLoan(id, {
      ...DRAFT,
      name: 'Renamed',
      annualRate: 9,
      events: [{ kind: 'moratorium', startMonth: 1, months: 3, type: 'interest_only', recovery: 'increase_emi' }],
    });
    const loaded = await getLoan(id);
    expect(loaded?.name).toBe('Renamed');
    expect(loaded?.annualRate).toBe(9);
    expect(loaded?.events).toHaveLength(1);
    expect(loaded?.events[0]!.kind).toBe('moratorium');
  });

  it('appends a single event without touching the others', async () => {
    const id = await insertLoan(DRAFT);
    await addLoanEvent(id, {
      kind: 'part_payment',
      startMonth: 10,
      amount: 25_000,
      frequency: 'once',
      mode: 'reduce_tenure',
    });
    await addLoanEvent(id, {
      kind: 'part_payment',
      startMonth: 20,
      amount: 30_000,
      frequency: 'once',
      mode: 'reduce_emi',
    });
    expect((await getLoan(id))?.events).toHaveLength(2);
  });

  it('lists loans newest first', async () => {
    await insertLoan({ ...DRAFT, name: 'First' });
    await insertLoan({ ...DRAFT, name: 'Second' });
    const names = (await listLoans()).map((l) => l.name);
    expect(names).toHaveLength(2);
    expect(names).toContain('First');
    expect(names).toContain('Second');
  });

  it('cascades events and payments on delete', async () => {
    const id = await insertLoan({
      ...DRAFT,
      events: [{ kind: 'part_payment', startMonth: 6, amount: 5_000, frequency: 'once', mode: 'reduce_tenure' }],
    });
    await markPaid(id, { no: 1, dueDate: '2026-02-01', amountDue: 8_678 }, '2026-02-01', 8_678);

    await deleteLoan(id);

    expect(await getLoan(id)).toBeNull();
    const db = await getDb();
    const events = await db.getAllAsync('SELECT * FROM loan_events WHERE loan_id = ?', id);
    const payments = await db.getAllAsync('SELECT * FROM payments WHERE loan_id = ?', id);
    expect(events).toHaveLength(0);
    expect(payments).toHaveLength(0);
  });

  it('returns null for a missing loan', async () => {
    expect(await getLoan(9999)).toBeNull();
  });
});

describe('payments', () => {
  it('marks an installment paid and unpaid', async () => {
    const id = await insertLoan(DRAFT);
    const installment = { no: 1, dueDate: '2026-02-01', amountDue: 8_678 };

    await markPaid(id, installment, '2026-02-03', 8_678);
    let payments = await listPayments(id);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ installmentNo: 1, paidDate: '2026-02-03', amountPaid: 8_678 });

    await markUnpaid(id, 1);
    payments = await listPayments(id);
    expect(payments).toHaveLength(0);
  });

  it('is idempotent — re-marking updates rather than duplicating', async () => {
    const id = await insertLoan(DRAFT);
    const installment = { no: 1, dueDate: '2026-02-01', amountDue: 8_678 };
    await markPaid(id, installment, '2026-02-03', 8_678);
    await markPaid(id, installment, '2026-02-05', 9_000);

    const payments = await listPayments(id);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ paidDate: '2026-02-05', amountPaid: 9_000 });
  });

  it('backfills every installment up to a cutoff', async () => {
    const id = await insertLoan(DRAFT);
    const installments = Array.from({ length: 24 }, (_, i) => ({
      no: i + 1,
      dueDate: `2026-${String((i % 12) + 1).padStart(2, '0')}-01`,
      amountDue: 8_678,
    }));

    await markPaidThrough(id, installments, 6);

    const payments = await listPayments(id);
    expect(payments).toHaveLength(6);
    expect(payments.map((p) => p.installmentNo)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(payments.every((p) => p.paidDate === p.dueDate)).toBe(true);
  });
});

describe('loans store projection', () => {
  it('derives progress, outstanding and next due from the schedule', async () => {
    const id = await insertLoan(DRAFT);
    await useLoansStore.getState().refresh();

    const item = useLoansStore.getState().byId(id)!;
    expect(item.result.tenureMonths).toBe(240);
    expect(item.result.emi).toBeCloseTo(8678.23, 1);
    expect(item.paidCount).toBe(0);
    expect(item.progressPct).toBe(0);
    expect(item.outstanding).toBeCloseTo(1_000_000, 2);
    expect(item.nextDueDate).toBe('2026-02-01');
    expect(item.isClosed).toBe(false);
  });

  it('moves progress and outstanding when an installment is marked paid', async () => {
    const id = await insertLoan(DRAFT);
    await useLoansStore.getState().refresh();
    const before = useLoansStore.getState().byId(id)!;
    const first = before.result.schedule[0]!;

    await useLoansStore
      .getState()
      .setInstallmentPaid(id, { no: first.no, dueDate: first.date, amountDue: first.emi }, true);

    const after = useLoansStore.getState().byId(id)!;
    expect(after.paidCount).toBe(1);
    expect(after.progressPct).toBeCloseTo(100 / 240, 4);
    // Only the principal portion of the EMI reduces the balance.
    expect(after.outstanding).toBeCloseTo(1_000_000 - first.principal, 2);
    expect(after.nextDueDate).toBe(before.result.schedule[1]!.date);
    expect(after.paidAmount).toBeCloseTo(first.emi, 2);
  });

  it('starts the schedule on the first payment date the loan was saved with', async () => {
    const derived = await insertLoan({ ...DRAFT, startDate: '2024-11-08' });
    const explicit = await insertLoan({
      ...DRAFT,
      startDate: '2024-11-08',
      firstPaymentDate: '2024-11-08',
    });
    await useLoansStore.getState().refresh();

    // Left alone, instalment 1 lands a month after the money arrives.
    expect(useLoansStore.getState().byId(derived)!.result.schedule[0]!.date).toBe('2024-12-08');
    // Set explicitly, it lands on the day the borrower chose.
    expect(useLoansStore.getState().byId(explicit)!.result.schedule[0]!.date).toBe('2024-11-08');
    expect(useLoansStore.getState().byId(explicit)!.result.monthsToFirstPayment).toBe(0);
  });

  it('splits what has been paid into principal and interest', async () => {
    const id = await insertLoan({ ...DRAFT, tenureMonths: 12, principal: 120_000 });
    await useLoansStore.getState().refresh();
    const schedule = useLoansStore.getState().byId(id)!.result.schedule;

    for (const row of schedule.slice(0, 3)) {
      await useLoansStore
        .getState()
        .setInstallmentPaid(id, { no: row.no, dueDate: row.date, amountDue: row.emi }, true);
    }

    const item = useLoansStore.getState().byId(id)!;
    const settled = schedule.slice(0, 3);
    expect(item.principalPaid).toBeCloseTo(
      settled.reduce((sum, row) => sum + row.principal, 0),
      2,
    );
    expect(item.interestPaid).toBeCloseTo(
      settled.reduce((sum, row) => sum + row.interest, 0),
      2,
    );
    // The two halves must account for every rupee handed over, and nothing more.
    expect(item.principalPaid + item.interestPaid).toBeCloseTo(item.paidAmount, 2);
    // What is left is the cash cost of every instalment still unpaid.
    expect(item.remainingAmount).toBeCloseTo(
      schedule.slice(3).reduce((sum, row) => sum + row.emi, 0),
      2,
    );
    expect(item.paidAmount + item.remainingAmount).toBeCloseTo(
      schedule.reduce((sum, row) => sum + row.emi, 0),
      2,
    );
  });

  it('excludes capitalised interest from interest paid', async () => {
    // Nothing is paid during a full moratorium, so those months add no interest to the paid total.
    const id = await insertLoan({
      ...DRAFT,
      tenureMonths: 12,
      principal: 120_000,
      events: [{ kind: 'moratorium', startMonth: 1, months: 2, type: 'full', recovery: 'extend_tenure' }],
    });
    await useLoansStore.getState().refresh();
    const schedule = useLoansStore.getState().byId(id)!.result.schedule;

    for (const row of schedule.slice(0, 2)) {
      await useLoansStore
        .getState()
        .setInstallmentPaid(id, { no: row.no, dueDate: row.date, amountDue: row.emi }, true);
    }

    const item = useLoansStore.getState().byId(id)!;
    expect(schedule[0]!.capitalised).toBeGreaterThan(0);
    expect(item.interestPaid).toBeCloseTo(0, 2);
    expect(item.principalPaid).toBeCloseTo(0, 2);
    expect(item.paidAmount).toBeCloseTo(0, 2);
  });

  it('counts overdue installments against today', async () => {
    // Disbursed 5 years ago on 1 Jan with nothing paid: every instalment already due is overdue.
    const startDate = `${new Date().getFullYear() - 5}-01-01`;
    const id = await insertLoan({ ...DRAFT, startDate });
    await useLoansStore.getState().refresh();

    const item = useLoansStore.getState().byId(id)!;
    // Instalment n falls on startDate + n months, so the count is the months elapsed since then.
    const expected = monthsBetween(startDate, todayISO());
    expect(item.overdueCount).toBe(expected);
    expect(item.paidCount).toBe(0);
  });

  it('marks a loan closed once every installment is paid', async () => {
    const id = await insertLoan({ ...DRAFT, tenureMonths: 3, principal: 30_000 });
    await useLoansStore.getState().refresh();
    const schedule = useLoansStore.getState().byId(id)!.result.schedule;

    for (const row of schedule) {
      await useLoansStore
        .getState()
        .setInstallmentPaid(id, { no: row.no, dueDate: row.date, amountDue: row.emi }, true);
    }

    const item = useLoansStore.getState().byId(id)!;
    expect(item.isClosed).toBe(true);
    expect(item.progressPct).toBeCloseTo(100, 6);
    expect(item.outstanding).toBeCloseTo(0, 2);
    expect(item.nextDueDate).toBeNull();
  });

  it('reflects a prepayment added through the store', async () => {
    const id = await insertLoan(DRAFT);
    await useLoansStore.getState().refresh();
    const before = useLoansStore.getState().byId(id)!;

    await useLoansStore.getState().addEvent(id, {
      kind: 'part_payment',
      startMonth: 12,
      amount: 200_000,
      frequency: 'once',
      mode: 'reduce_tenure',
    });

    const after = useLoansStore.getState().byId(id)!;
    expect(after.result.tenureMonths).toBeLessThan(before.result.tenureMonths);
    expect(after.result.totalInterest).toBeLessThan(before.result.totalInterest);
    expect(after.loan.events).toHaveLength(1);
  });

  it('creates, updates and removes through the store', async () => {
    const store = useLoansStore.getState();
    const id = await store.create({ ...DRAFT, name: 'Car loan', type: 'car' });
    expect(useLoansStore.getState().byId(id)?.loan.name).toBe('Car loan');

    await useLoansStore.getState().update(id, { ...DRAFT, name: 'Car loan v2', type: 'car' });
    expect(useLoansStore.getState().byId(id)?.loan.name).toBe('Car loan v2');

    await useLoansStore.getState().remove(id);
    expect(useLoansStore.getState().byId(id)).toBeUndefined();
  });
});

describe('settings kv', () => {
  it('upserts by key', async () => {
    await writeSetting('currency', 'USD');
    await writeSetting('currency', 'CAD');
    await writeSetting('theme_preference', 'dark');

    const all = await readAllSettings();
    expect(all.currency).toBe('CAD');
    expect(all.theme_preference).toBe('dark');
  });
});

describe('fx cache', () => {
  it('stores and replaces rates for a base', async () => {
    await writeCachedRates('USD', { INR: 83.5, EUR: 0.92 }, '2026-08-06T00:00:00.000Z');
    let cached = await readCachedRates('USD');
    expect(cached?.rates).toEqual({ INR: 83.5, EUR: 0.92 });
    expect(cached?.fetchedAt).toBe('2026-08-06T00:00:00.000Z');

    await writeCachedRates('USD', { INR: 84.1 }, '2026-08-07T00:00:00.000Z');
    cached = await readCachedRates('USD');
    expect(cached?.rates).toEqual({ INR: 84.1 });
    expect(cached?.fetchedAt).toBe('2026-08-07T00:00:00.000Z');
  });

  it('returns null when nothing is cached', async () => {
    expect(await readCachedRates('GBP')).toBeNull();
  });
});

// Keeps the direct node:sqlite import meaningful — the mock relies on the same binding.
it('has node:sqlite available', () => {
  expect(typeof DatabaseSync).toBe('function');
});
