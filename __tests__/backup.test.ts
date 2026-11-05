/**
 * Backup format and the database round trip. `expo-sqlite` is mocked over Node's `node:sqlite`,
 * the same adapter `db.test.ts` uses, so the real migrations and SQL run.
 */

jest.mock('expo-sqlite', () => {
  const { DatabaseSync: Sync } = require('node:sqlite') as typeof import('node:sqlite');
  const wrap = (db: InstanceType<typeof Sync>) => ({
    execAsync: async (sql: string) => {
      db.exec(sql);
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      const result = db.prepare(sql).run(...(params as never[]));
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    getFirstAsync: async (sql: string, ...params: unknown[]) => db.prepare(sql).get(...(params as never[])) ?? null,
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
  return { openDatabaseAsync: async () => wrap(new Sync(':memory:')) };
});

import { readBackupData, restoreBackupData } from '../src/db/backup';
import { resetDatabase } from '../src/db/client';
import { readAllSettings, writeSetting } from '../src/db/kv';
import { getLoan, insertLoan, listLoans, type LoanDraft } from '../src/db/loans';
import { listPayments, markPaid } from '../src/db/payments';
import { saveCalculation } from '../src/db/calculations';
import {
  BackupError,
  backupFileName,
  describeBackup,
  parseBackup,
  serialiseBackup,
} from '../src/lib/backup';

const DRAFT: LoanDraft = {
  name: 'Home loan',
  type: 'home',
  principal: 1_000_000,
  annualRate: 8.5,
  tenureMonths: 240,
  startDate: '2026-01-10',
  firstPaymentDate: null,
  advanceEmis: 0,
  fees: 5_000,
  currency: 'INR',
  notes: 'SBI',
  events: [
    { kind: 'part_payment', startMonth: 12, amount: 50_000, frequency: 'half_yearly', mode: 'reduce_tenure', count: 4 },
    { kind: 'rate_change', startMonth: 24, annualRate: 9, mode: 'reduce_emi' },
    { kind: 'moratorium', startMonth: 3, months: 2, type: 'interest_only', recovery: 'extend_tenure' },
  ],
};

async function makeBackupText(): Promise<string> {
  return serialiseBackup({ exportedAt: '2026-11-05T10:00:00Z', appVersion: '1.1.0', ...(await readBackupData()) });
}

beforeEach(async () => {
  await resetDatabase();
});

describe('backup file', () => {
  it('names the file by date', () => {
    expect(backupFileName('2026-11-05')).toBe('emi-calculator-backup-2026-11-05.json');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"app":"other"}')).toThrow('not a backup from this app');
    expect(() => parseBackup('{"app":"emi-loan-calculator","format":99}')).toThrow('newer version');
  });

  it('names the bad field in a damaged loan', () => {
    const bad = JSON.stringify({
      app: 'emi-loan-calculator',
      format: 1,
      loans: [{ ...DRAFT, principal: -1, createdAt: '', updatedAt: '', payments: [] }],
    });
    expect(() => parseBackup(bad)).toThrow('loan 1 has a bad principal');
  });

  it('rejects an unknown adjustment', () => {
    const bad = JSON.stringify({
      app: 'emi-loan-calculator',
      format: 1,
      loans: [{ ...DRAFT, createdAt: '', updatedAt: '', events: [{ kind: 'gift', startMonth: 1 }] }],
    });
    expect(() => parseBackup(bad)).toThrow('loan 1, adjustment 1 has a bad kind');
  });
});

describe('backup round trip', () => {
  it('restores loans, adjustments, payments, settings and history exactly', async () => {
    const id = await insertLoan(DRAFT);
    await insertLoan({ ...DRAFT, name: 'Car loan', type: 'car', events: [], notes: null });
    await markPaid(id, { no: 1, dueDate: '2026-02-10', amountDue: 8_678.23 }, '2026-02-09', 8_678.23);
    await markPaid(id, { no: 2, dueDate: '2026-03-10', amountDue: 8_678.23 }, '2026-03-10', 8_700);
    await writeSetting('notification_time', '08:30');
    await writeSetting('not_a_setting', 'x');
    await saveCalculation('sip', 'SIP of 5,000', { monthly: 5_000 });

    const text = await makeBackupText();
    const backup = parseBackup(text);
    expect(describeBackup(backup)).toBe('2 loans, 2 paid instalments');
    expect(backup.settings).toEqual({ notification_time: '08:30' });

    const before = await listLoans();
    await resetDatabase();
    await writeSetting('notification_time', '21:00');
    await insertLoan({ ...DRAFT, name: 'Will be replaced' });

    await restoreBackupData(backup);

    const after = await listLoans();
    expect(after.map((l) => l.name).sort()).toEqual(['Car loan', 'Home loan']);
    const home = after.find((l) => l.name === 'Home loan')!;
    const original = before.find((l) => l.name === 'Home loan')!;
    expect(home.events).toEqual(original.events);
    expect(home.notes).toBe('SBI');
    expect(home.createdAt).toBe(original.createdAt);
    expect((await getLoan(home.id))!.fees).toBe(5_000);

    const payments = await listPayments(home.id);
    expect(payments.map((p) => [p.installmentNo, p.paidDate, p.amountPaid])).toEqual([
      [1, '2026-02-09', 8_678.23],
      [2, '2026-03-10', 8_700],
    ]);

    expect((await readAllSettings()).notification_time).toBe('08:30');
    // A second export of the restored data matches the first, apart from row ids.
    expect(JSON.parse(await makeBackupText()).loans).toEqual(JSON.parse(text).loans);
  });

  it('leaves the data as it was when the restore fails', async () => {
    await insertLoan(DRAFT);
    const backup = parseBackup(await makeBackupText());
    // Force a constraint failure inside the transaction.
    (backup.loans[0] as { name: unknown }).name = null;
    await expect(restoreBackupData(backup)).rejects.toThrow();
    expect((await listLoans()).map((l) => l.name)).toEqual(['Home loan']);
  });
});
