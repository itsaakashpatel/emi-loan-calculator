import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Schema versions are applied in order via `PRAGMA user_version`. Append new entries; never edit a
 * shipped one.
 */
const MIGRATIONS: ReadonlyArray<(db: SQLiteDatabase) => Promise<void>> = [
  // v1 — initial schema
  async (db) => {
    await db.execAsync(`
      CREATE TABLE loans (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        type          TEXT    NOT NULL DEFAULT 'home',
        principal     REAL    NOT NULL,
        annual_rate   REAL    NOT NULL,
        tenure_months INTEGER NOT NULL,
        start_date    TEXT    NOT NULL,
        advance_emis  INTEGER NOT NULL DEFAULT 0,
        fees          REAL    NOT NULL DEFAULT 0,
        currency      TEXT    NOT NULL DEFAULT 'INR',
        notes         TEXT,
        created_at    TEXT    NOT NULL,
        updated_at    TEXT    NOT NULL
      );

      CREATE TABLE loan_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id     INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        kind        TEXT    NOT NULL,
        month_index INTEGER NOT NULL,
        amount      REAL,
        frequency   TEXT,
        mode        TEXT,
        occurrences INTEGER,
        annual_rate REAL,
        months      INTEGER,
        sub_type    TEXT,
        recovery    TEXT,
        created_at  TEXT    NOT NULL
      );
      CREATE INDEX idx_loan_events_loan ON loan_events(loan_id);

      CREATE TABLE payments (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id        INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        installment_no INTEGER NOT NULL,
        due_date       TEXT    NOT NULL,
        amount_due     REAL    NOT NULL,
        paid_date      TEXT,
        amount_paid    REAL,
        UNIQUE(loan_id, installment_no)
      );
      CREATE INDEX idx_payments_loan ON payments(loan_id);

      CREATE TABLE saved_calculations (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        kind        TEXT NOT NULL,
        title       TEXT NOT NULL,
        inputs_json TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE kv_settings (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );

      CREATE TABLE fx_rates (
        base       TEXT NOT NULL,
        quote      TEXT NOT NULL,
        rate       REAL NOT NULL,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (base, quote)
      );
    `);
  },
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  for (let target = version; target < MIGRATIONS.length; target += 1) {
    const step = MIGRATIONS[target]!;
    await step(db);
    version = target + 1;
    // PRAGMA does not accept bound parameters, and `version` is a loop counter, not user input.
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

export const SCHEMA_VERSION = MIGRATIONS.length;
