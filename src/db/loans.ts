import { getDb } from './client';
import { todayISO } from '../lib/format/date';
import type {
  AdjustMode,
  LoanEvent,
  MoratoriumRecovery,
  MoratoriumType,
  PartPaymentFrequency,
} from '../lib/finance/types';
import type { LoanType } from '../store/calculator';

export interface SavedLoan {
  id: number;
  name: string;
  type: LoanType;
  principal: number;
  annualRate: number;
  tenureMonths: number;
  startDate: string;
  advanceEmis: number;
  fees: number;
  currency: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  events: LoanEvent[];
}

export interface LoanDraft {
  name: string;
  type: LoanType;
  principal: number;
  annualRate: number;
  tenureMonths: number;
  startDate: string;
  advanceEmis: number;
  fees: number;
  currency: string;
  notes?: string | null;
  events: LoanEvent[];
}

interface LoanRow {
  id: number;
  name: string;
  type: string;
  principal: number;
  annual_rate: number;
  tenure_months: number;
  start_date: string;
  advance_emis: number;
  fees: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface EventRow {
  id: number;
  loan_id: number;
  kind: string;
  month_index: number;
  amount: number | null;
  frequency: string | null;
  mode: string | null;
  occurrences: number | null;
  annual_rate: number | null;
  months: number | null;
  sub_type: string | null;
  recovery: string | null;
}

function rowToEvent(row: EventRow): LoanEvent | null {
  switch (row.kind) {
    case 'part_payment':
      return {
        kind: 'part_payment',
        startMonth: row.month_index,
        amount: row.amount ?? 0,
        frequency: (row.frequency ?? 'once') as PartPaymentFrequency,
        mode: (row.mode ?? 'reduce_tenure') as AdjustMode,
        ...(row.occurrences ? { count: row.occurrences } : null),
      };
    case 'rate_change':
      return {
        kind: 'rate_change',
        startMonth: row.month_index,
        annualRate: row.annual_rate ?? 0,
        mode: (row.mode ?? 'reduce_tenure') as AdjustMode,
      };
    case 'moratorium':
      return {
        kind: 'moratorium',
        startMonth: row.month_index,
        months: row.months ?? 0,
        type: (row.sub_type ?? 'full') as MoratoriumType,
        recovery: (row.recovery ?? 'extend_tenure') as MoratoriumRecovery,
      };
    default:
      return null;
  }
}

function rowToLoan(row: LoanRow, events: LoanEvent[]): SavedLoan {
  return {
    id: row.id,
    name: row.name,
    type: row.type as LoanType,
    principal: row.principal,
    annualRate: row.annual_rate,
    tenureMonths: row.tenure_months,
    startDate: row.start_date,
    advanceEmis: row.advance_emis,
    fees: row.fees,
    currency: row.currency,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    events,
  };
}

async function insertEvents(loanId: number, events: LoanEvent[]): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  for (const event of events) {
    if (event.kind === 'part_payment') {
      await db.runAsync(
        `INSERT INTO loan_events (loan_id, kind, month_index, amount, frequency, mode, occurrences, created_at)
         VALUES (?, 'part_payment', ?, ?, ?, ?, ?, ?)`,
        loanId,
        event.startMonth,
        event.amount,
        event.frequency,
        event.mode,
        event.count ?? null,
        now,
      );
    } else if (event.kind === 'rate_change') {
      await db.runAsync(
        `INSERT INTO loan_events (loan_id, kind, month_index, annual_rate, mode, created_at)
         VALUES (?, 'rate_change', ?, ?, ?, ?)`,
        loanId,
        event.startMonth,
        event.annualRate,
        event.mode,
        now,
      );
    } else {
      await db.runAsync(
        `INSERT INTO loan_events (loan_id, kind, month_index, months, sub_type, recovery, created_at)
         VALUES (?, 'moratorium', ?, ?, ?, ?, ?)`,
        loanId,
        event.startMonth,
        event.months,
        event.type,
        event.recovery,
        now,
      );
    }
  }
}

export async function listLoans(): Promise<SavedLoan[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<LoanRow>('SELECT * FROM loans ORDER BY created_at DESC');
  const events = await db.getAllAsync<EventRow>('SELECT * FROM loan_events ORDER BY month_index');
  const byLoan = new Map<number, LoanEvent[]>();
  for (const row of events) {
    const parsed = rowToEvent(row);
    if (!parsed) continue;
    const list = byLoan.get(row.loan_id);
    if (list) list.push(parsed);
    else byLoan.set(row.loan_id, [parsed]);
  }
  return rows.map((row) => rowToLoan(row, byLoan.get(row.id) ?? []));
}

export async function getLoan(id: number): Promise<SavedLoan | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<LoanRow>('SELECT * FROM loans WHERE id = ?', id);
  if (!row) return null;
  const events = await db.getAllAsync<EventRow>(
    'SELECT * FROM loan_events WHERE loan_id = ? ORDER BY month_index',
    id,
  );
  return rowToLoan(row, events.map(rowToEvent).filter((e): e is LoanEvent => e !== null));
}

export async function insertLoan(draft: LoanDraft): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.runAsync(
    `INSERT INTO loans
       (name, type, principal, annual_rate, tenure_months, start_date, advance_emis, fees, currency, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    draft.name,
    draft.type,
    draft.principal,
    draft.annualRate,
    draft.tenureMonths,
    draft.startDate,
    draft.advanceEmis,
    draft.fees,
    draft.currency,
    draft.notes ?? null,
    now,
    now,
  );
  const id = result.lastInsertRowId;
  await insertEvents(id, draft.events);
  return id;
}

export async function updateLoan(id: number, draft: LoanDraft): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE loans SET name = ?, type = ?, principal = ?, annual_rate = ?, tenure_months = ?,
       start_date = ?, advance_emis = ?, fees = ?, currency = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    draft.name,
    draft.type,
    draft.principal,
    draft.annualRate,
    draft.tenureMonths,
    draft.startDate,
    draft.advanceEmis,
    draft.fees,
    draft.currency,
    draft.notes ?? null,
    new Date().toISOString(),
    id,
  );
  await db.runAsync('DELETE FROM loan_events WHERE loan_id = ?', id);
  await insertEvents(id, draft.events);
}

/** Appends a single event — used by "add prepayment" on the loan detail screen. */
export async function addLoanEvent(loanId: number, event: LoanEvent): Promise<void> {
  await insertEvents(loanId, [event]);
  const db = await getDb();
  await db.runAsync('UPDATE loans SET updated_at = ? WHERE id = ?', new Date().toISOString(), loanId);
}

export async function deleteLoan(id: number): Promise<void> {
  const db = await getDb();
  // ON DELETE CASCADE clears events and payments.
  await db.runAsync('DELETE FROM loans WHERE id = ?', id);
}

export function draftFromLoan(loan: SavedLoan): LoanDraft {
  return {
    name: loan.name,
    type: loan.type,
    principal: loan.principal,
    annualRate: loan.annualRate,
    tenureMonths: loan.tenureMonths,
    startDate: loan.startDate,
    advanceEmis: loan.advanceEmis,
    fees: loan.fees,
    currency: loan.currency,
    notes: loan.notes,
    events: loan.events,
  };
}

export function emptyDraft(currency: string): LoanDraft {
  return {
    name: '',
    type: 'home',
    principal: 0,
    annualRate: 0,
    tenureMonths: 12,
    startDate: todayISO(),
    advanceEmis: 0,
    fees: 0,
    currency,
    events: [],
  };
}
