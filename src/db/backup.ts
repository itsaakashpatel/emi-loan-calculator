import { getDb } from './client';
import { insertEvents, listLoans, type SavedLoan } from './loans';
import { listPayments } from './payments';
import { readAllSettings } from './kv';
import type { BackupCalculation, BackupFile, BackupLoan } from '../lib/backup';
import { LOAN_TYPES } from '../store/calculator';
import { SETTING_KEYS } from '../store/settings';

/** Everything a backup holds, read from the database. */
export async function readBackupData(): Promise<Pick<BackupFile, 'loans' | 'settings' | 'calculations'>> {
  const db = await getDb();
  const loans = await listLoans();
  const withPayments: BackupLoan[] = await Promise.all(
    loans.map(async (loan: SavedLoan) => ({
      name: loan.name,
      type: loan.type,
      principal: loan.principal,
      annualRate: loan.annualRate,
      tenureMonths: loan.tenureMonths,
      startDate: loan.startDate,
      firstPaymentDate: loan.firstPaymentDate,
      advanceEmis: loan.advanceEmis,
      fees: loan.fees,
      currency: loan.currency,
      notes: loan.notes,
      createdAt: loan.createdAt,
      updatedAt: loan.updatedAt,
      events: loan.events,
      payments: await listPayments(loan.id),
    })),
  );

  const allSettings = await readAllSettings();
  const settings = Object.fromEntries(
    Object.entries(allSettings).filter(([key]) => SETTING_KEYS.includes(key)),
  );

  const calculations = await db.getAllAsync<{
    kind: string;
    title: string;
    inputs_json: string;
    created_at: string;
  }>('SELECT kind, title, inputs_json, created_at FROM saved_calculations ORDER BY created_at, id');

  return {
    loans: withPayments,
    settings,
    calculations: calculations.map(
      (row): BackupCalculation => ({
        kind: row.kind,
        title: row.title,
        inputsJson: row.inputs_json,
        createdAt: row.created_at,
      }),
    ),
  };
}

const KNOWN_TYPES = new Set<string>(LOAN_TYPES.map((t) => t.value));

/**
 * Replaces every saved loan, payment, setting and history entry with the backup's, in one
 * transaction: if any row fails, nothing changes. Exchange rates are a cache and are left alone.
 */
export async function restoreBackupData(backup: BackupFile): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM payments;
      DELETE FROM loan_events;
      DELETE FROM loans;
      DELETE FROM saved_calculations;
    `);

    for (const loan of backup.loans) {
      const result = await db.runAsync(
        `INSERT INTO loans
           (name, type, principal, annual_rate, tenure_months, start_date, first_payment_date, advance_emis, fees, currency, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        loan.name,
        KNOWN_TYPES.has(loan.type) ? loan.type : 'other',
        loan.principal,
        loan.annualRate,
        loan.tenureMonths,
        loan.startDate,
        loan.firstPaymentDate,
        loan.advanceEmis,
        loan.fees,
        // INR is the only display currency.
        'INR',
        loan.notes,
        loan.createdAt || now,
        loan.updatedAt || now,
      );
      const loanId = result.lastInsertRowId;
      await insertEvents(loanId, loan.events);
      for (const payment of loan.payments) {
        await db.runAsync(
          `INSERT OR REPLACE INTO payments (loan_id, installment_no, due_date, amount_due, paid_date, amount_paid)
           VALUES (?, ?, ?, ?, ?, ?)`,
          loanId,
          payment.installmentNo,
          payment.dueDate,
          payment.amountDue,
          payment.paidDate,
          payment.amountPaid,
        );
      }
    }

    for (const entry of backup.calculations) {
      await db.runAsync(
        'INSERT INTO saved_calculations (kind, title, inputs_json, created_at) VALUES (?, ?, ?, ?)',
        entry.kind,
        entry.title,
        entry.inputsJson,
        entry.createdAt || now,
      );
    }

    for (const [key, value] of Object.entries(backup.settings)) {
      if (!SETTING_KEYS.includes(key)) continue;
      await db.runAsync(
        'INSERT INTO kv_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
    }
  });
}
