import * as SQLite from 'expo-sqlite';

import { migrate } from './migrations';

const DATABASE_NAME = 'emi-loan-manager.db';

let handle: Promise<SQLite.SQLiteDatabase> | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await migrate(db);
  return db;
}

/**
 * Single shared connection, opened and migrated on first use. Deliberately module-level rather than
 * a React context so zustand store actions can reach the database without a hook.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!handle) handle = open();
  return handle;
}

/** Test/reset helper: drops every row but keeps the schema. */
export async function resetDatabase(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM payments;
    DELETE FROM loan_events;
    DELETE FROM loans;
    DELETE FROM saved_calculations;
    DELETE FROM fx_rates;
    DELETE FROM portfolio_mf_holdings;
    DELETE FROM portfolio_stock_holdings;
    DELETE FROM portfolio_members;
  `);
}

export type Db = SQLite.SQLiteDatabase;
