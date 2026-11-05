/**
 * The backup file: every saved loan with its adjustments and payments, the settings, and the
 * calculation history, as one JSON document.
 *
 * `parseBackup` checks every field before anything touches the database, so a damaged or foreign
 * file fails with a clear message and leaves the current data as it is.
 *
 * Pure TypeScript, no React Native imports.
 */

import type { LoanEvent } from './finance/types';

export const BACKUP_APP = 'emi-loan-calculator';
export const BACKUP_FORMAT = 1;

export interface BackupPayment {
  installmentNo: number;
  dueDate: string;
  amountDue: number;
  paidDate: string | null;
  amountPaid: number | null;
}

export interface BackupLoan {
  name: string;
  type: string;
  principal: number;
  annualRate: number;
  tenureMonths: number;
  startDate: string;
  firstPaymentDate: string | null;
  advanceEmis: number;
  fees: number;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  events: LoanEvent[];
  payments: BackupPayment[];
}

export interface BackupCalculation {
  kind: string;
  title: string;
  inputsJson: string;
  createdAt: string;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  format: number;
  exportedAt: string;
  appVersion: string;
  loans: BackupLoan[];
  settings: Record<string, string>;
  calculations: BackupCalculation[];
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

export function serialiseBackup(backup: Omit<BackupFile, 'app' | 'format'>): string {
  const file: BackupFile = { app: BACKUP_APP, format: BACKUP_FORMAT, ...backup };
  return JSON.stringify(file, null, 2);
}

/** `emi-calculator-backup-2026-11-05.json`. */
export function backupFileName(today: string): string {
  return `emi-calculator-backup-${today}.json`;
}

/** `2 loans, 37 payments` — for the confirmation before a restore. */
export function describeBackup(backup: BackupFile): string {
  const loans = backup.loans.length;
  const payments = backup.loans.reduce((sum, loan) => sum + loan.payments.filter((p) => p.paidDate).length, 0);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return `${plural(loans, 'loan')}, ${plural(payments, 'paid instalment')}`;
}

/* ---------------------------------------------------------------- parsing ---- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(where: string, what: string): never {
  throw new BackupError(`The backup file is damaged: ${where} has a bad ${what}.`);
}

function str(obj: Json, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== 'string') fail(where, key);
  return value;
}

function optStr(obj: Json, key: string, where: string): string | null {
  const value = obj[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') fail(where, key);
  return value;
}

function date(obj: Json, key: string, where: string): string {
  const value = str(obj, key, where);
  if (!ISO_DATE.test(value)) fail(where, key);
  return value;
}

function optDate(obj: Json, key: string, where: string): string | null {
  const value = optStr(obj, key, where);
  if (value !== null && !ISO_DATE.test(value)) fail(where, key);
  return value;
}

function num(obj: Json, key: string, where: string, { min = 0, int = false } = {}): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) fail(where, key);
  if (int && !Number.isInteger(value)) fail(where, key);
  return value;
}

function optNum(obj: Json, key: string, where: string): number | null {
  const value = obj[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(where, key);
  return value;
}

function oneOf<T extends string>(obj: Json, key: string, where: string, allowed: readonly T[]): T {
  const value = obj[key];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) fail(where, key);
  return value as T;
}

function parseEvent(raw: unknown, where: string): LoanEvent {
  if (!isObject(raw)) fail(where, 'entry');
  const kind = oneOf(raw, 'kind', where, ['part_payment', 'rate_change', 'moratorium'] as const);
  const startMonth = num(raw, 'startMonth', where, { min: 1, int: true });
  const mode = () => oneOf(raw, 'mode', where, ['reduce_tenure', 'reduce_emi'] as const);
  switch (kind) {
    case 'part_payment': {
      const count = raw.count === undefined || raw.count === null ? undefined : num(raw, 'count', where, { min: 1, int: true });
      return {
        kind,
        startMonth,
        amount: num(raw, 'amount', where),
        frequency: oneOf(raw, 'frequency', where, ['once', 'monthly', 'quarterly', 'half_yearly', 'yearly'] as const),
        mode: mode(),
        ...(count !== undefined ? { count } : null),
      };
    }
    case 'rate_change':
      return { kind, startMonth, annualRate: num(raw, 'annualRate', where), mode: mode() };
    case 'moratorium':
      return {
        kind,
        startMonth,
        months: num(raw, 'months', where, { min: 1, int: true }),
        type: oneOf(raw, 'type', where, ['full', 'interest_only'] as const),
        recovery: oneOf(raw, 'recovery', where, ['extend_tenure', 'increase_emi'] as const),
      };
  }
}

function parsePayment(raw: unknown, where: string): BackupPayment {
  if (!isObject(raw)) fail(where, 'entry');
  return {
    installmentNo: num(raw, 'installmentNo', where, { min: 1, int: true }),
    dueDate: date(raw, 'dueDate', where),
    amountDue: num(raw, 'amountDue', where),
    paidDate: optDate(raw, 'paidDate', where),
    amountPaid: optNum(raw, 'amountPaid', where),
  };
}

function list(obj: Json, key: string, where: string): unknown[] {
  const value = obj[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(where, key);
  return value;
}

function parseLoan(raw: unknown, index: number): BackupLoan {
  const where = `loan ${index + 1}`;
  if (!isObject(raw)) fail(where, 'entry');
  const name = str(raw, 'name', where).trim();
  if (!name) fail(where, 'name');
  return {
    name,
    type: str(raw, 'type', where),
    principal: num(raw, 'principal', where),
    annualRate: num(raw, 'annualRate', where),
    tenureMonths: num(raw, 'tenureMonths', where, { min: 1, int: true }),
    startDate: date(raw, 'startDate', where),
    firstPaymentDate: optDate(raw, 'firstPaymentDate', where),
    advanceEmis: num(raw, 'advanceEmis', where, { int: true }),
    fees: num(raw, 'fees', where),
    currency: str(raw, 'currency', where),
    notes: optStr(raw, 'notes', where),
    createdAt: str(raw, 'createdAt', where),
    updatedAt: str(raw, 'updatedAt', where),
    events: list(raw, 'events', where).map((event, i) => parseEvent(event, `${where}, adjustment ${i + 1}`)),
    payments: list(raw, 'payments', where).map((payment, i) => parsePayment(payment, `${where}, payment ${i + 1}`)),
  };
}

function parseCalculation(raw: unknown, index: number): BackupCalculation {
  const where = `history entry ${index + 1}`;
  if (!isObject(raw)) fail(where, 'entry');
  const inputsJson = str(raw, 'inputsJson', where);
  try {
    JSON.parse(inputsJson);
  } catch {
    fail(where, 'inputsJson');
  }
  return {
    kind: str(raw, 'kind', where),
    title: str(raw, 'title', where),
    inputsJson,
    createdAt: str(raw, 'createdAt', where),
  };
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('This file is not a backup from this app. It is not valid JSON.');
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP) {
    throw new BackupError('This file is not a backup from this app.');
  }
  if (typeof raw.format !== 'number' || raw.format > BACKUP_FORMAT) {
    throw new BackupError('This backup was made by a newer version of the app. Update the app, then try again.');
  }

  const settings: Record<string, string> = {};
  if (raw.settings !== undefined) {
    if (!isObject(raw.settings)) fail('settings', 'value');
    for (const [key, value] of Object.entries(raw.settings)) {
      if (typeof value === 'string') settings[key] = value;
    }
  }

  return {
    app: BACKUP_APP,
    format: raw.format,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
    loans: list(raw, 'loans', 'the file').map(parseLoan),
    settings,
    calculations: list(raw, 'calculations', 'the file').map(parseCalculation),
  };
}
