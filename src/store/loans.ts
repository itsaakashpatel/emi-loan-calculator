import { create } from 'zustand';

import {
  addLoanEvent,
  deleteLoan,
  insertLoan,
  listLoans,
  updateLoan,
  type LoanDraft,
  type SavedLoan,
} from '../db/loans';
import { listPayments, markPaid, markUnpaid, type PaymentRecord } from '../db/payments';
import { amortize } from '../lib/finance/emi';
import { todayISO } from '../lib/format/date';
import type { LoanEvent, LoanResult } from '../lib/finance/types';

export interface LoanWithProgress {
  loan: SavedLoan;
  /** Recomputed from the loan + its events; never persisted. */
  result: LoanResult;
  payments: PaymentRecord[];
  paidCount: number;
  paidAmount: number;
  /** 0-100, share of installments settled. */
  progressPct: number;
  outstanding: number;
  nextDueDate: string | null;
  nextDueAmount: number;
  overdueCount: number;
  isClosed: boolean;
}

export interface LoansState {
  loading: boolean;
  items: LoanWithProgress[];
  refresh: () => Promise<void>;
  create: (draft: LoanDraft) => Promise<number>;
  update: (id: number, draft: LoanDraft) => Promise<void>;
  remove: (id: number) => Promise<void>;
  addEvent: (id: number, event: LoanEvent) => Promise<void>;
  setInstallmentPaid: (
    id: number,
    installment: { no: number; dueDate: string; amountDue: number },
    paid: boolean,
  ) => Promise<void>;
  byId: (id: number) => LoanWithProgress | undefined;
}

function project(loan: SavedLoan, payments: PaymentRecord[]): LoanWithProgress {
  const result = amortize({
    principal: loan.principal,
    annualRate: loan.annualRate,
    tenureMonths: loan.tenureMonths,
    startDate: loan.startDate,
    advanceEmis: loan.advanceEmis,
    fees: loan.fees,
    events: loan.events,
  });

  const paid = payments.filter((p) => p.paidDate !== null);
  const paidNumbers = new Set(paid.map((p) => p.installmentNo));
  const paidAmount = paid.reduce((sum, p) => sum + (p.amountPaid ?? 0), 0);
  const today = todayISO();

  const pending = result.schedule.filter((row) => !paidNumbers.has(row.no));
  const next = pending[0];
  const overdueCount = pending.filter((row) => row.date < today).length;
  const totalInstallments = result.schedule.length;
  const principalPaid = result.schedule
    .filter((row) => paidNumbers.has(row.no))
    .reduce((sum, row) => sum + row.principal + row.prepayment, 0);

  return {
    loan,
    result,
    payments,
    paidCount: paid.length,
    paidAmount,
    progressPct: totalInstallments > 0 ? (paid.length / totalInstallments) * 100 : 0,
    outstanding: Math.max(0, loan.principal + result.capitalisedInterest - principalPaid),
    nextDueDate: next?.date ?? null,
    nextDueAmount: next ? next.emi + next.prepayment : 0,
    overdueCount,
    isClosed: pending.length === 0,
  };
}

async function loadAll(): Promise<LoanWithProgress[]> {
  const loans = await listLoans();
  const projected = await Promise.all(
    loans.map(async (loan) => project(loan, await listPayments(loan.id))),
  );
  return projected;
}

export const useLoansStore = create<LoansState>((set, get) => ({
  loading: true,
  items: [],

  refresh: async () => {
    try {
      set({ items: await loadAll(), loading: false });
    } catch {
      set({ loading: false });
    }
  },

  create: async (draft) => {
    const id = await insertLoan(draft);
    await get().refresh();
    return id;
  },

  update: async (id, draft) => {
    await updateLoan(id, draft);
    await get().refresh();
  },

  remove: async (id) => {
    await deleteLoan(id);
    await get().refresh();
  },

  addEvent: async (id, event) => {
    await addLoanEvent(id, event);
    await get().refresh();
  },

  setInstallmentPaid: async (id, installment, paid) => {
    if (paid) await markPaid(id, installment, todayISO(), installment.amountDue);
    else await markUnpaid(id, installment.no);
    await get().refresh();
  },

  byId: (id) => get().items.find((item) => item.loan.id === id),
}));
