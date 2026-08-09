import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { todayISO } from '../lib/format/date';
import type { LoanEvent, LoanInput } from '../lib/finance/types';

export type LoanType = 'home' | 'car' | 'personal' | 'business' | 'education' | 'gold' | 'other';

export const LOAN_TYPES: ReadonlyArray<{ value: LoanType; label: string; icon: string }> = [
  { value: 'home', label: 'Home', icon: 'home-outline' },
  { value: 'car', label: 'Car', icon: 'car-outline' },
  { value: 'personal', label: 'Personal', icon: 'person-outline' },
  { value: 'business', label: 'Business', icon: 'briefcase-outline' },
  { value: 'education', label: 'Education', icon: 'school-outline' },
  { value: 'gold', label: 'Gold', icon: 'diamond-outline' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal-outline' },
];

/**
 * Which of the four EMI variables is being derived. Fixing any three determines the fourth, and the
 * calculator screen lets you pick — the same idea as the original app's radio selector.
 */
export type SolveFor = 'emi' | 'amount' | 'rate' | 'tenure';

export const SOLVE_FOR_OPTIONS: ReadonlyArray<{ value: SolveFor; label: string }> = [
  { value: 'emi', label: 'EMI' },
  { value: 'amount', label: 'Amount' },
  { value: 'rate', label: 'Rate' },
  { value: 'tenure', label: 'Tenure' },
];

export interface CalculatorState {
  principal: number;
  annualRate: number;
  tenureMonths: number;
  startDate: string;
  advanceEmis: number;
  fees: number;
  loanType: LoanType;
  events: LoanEvent[];
  solveFor: SolveFor;
  /** User-entered instalment, used when the unknown is something other than the EMI. */
  emi: number;
  /** Bumped whenever defaults are re-seeded, so screens can reset local input text. */
  revision: number;

  setPrincipal: (value: number) => void;
  setAnnualRate: (value: number) => void;
  setTenureMonths: (value: number) => void;
  setStartDate: (value: string) => void;
  setAdvanceEmis: (value: number) => void;
  setFees: (value: number) => void;
  setLoanType: (value: LoanType) => void;
  setSolveFor: (value: SolveFor) => void;
  setEmi: (value: number) => void;
  addEvent: (event: LoanEvent) => void;
  updateEvent: (index: number, event: LoanEvent) => void;
  removeEvent: (index: number) => void;
  clearEvents: () => void;
  /** Applies the user's saved defaults; used on first load and after "reset". */
  seedDefaults: (defaults: { annualRate: number; tenureYears: number }) => void;
  loadFrom: (input: LoanInput & { loanType?: LoanType }) => void;
  toInput: () => LoanInput;
}

const INITIAL = {
  principal: 1_000_000,
  annualRate: 8.5,
  tenureMonths: 240,
  advanceEmis: 0,
  fees: 0,
  loanType: 'home' as LoanType,
  solveFor: 'emi' as SolveFor,
  emi: 10_000,
};

export const useCalculatorStore = create<CalculatorState>((set, get) => ({
  ...INITIAL,
  startDate: todayISO(),
  events: [],
  revision: 0,

  setPrincipal: (principal) => set({ principal: Math.max(0, principal) }),
  setAnnualRate: (annualRate) => set({ annualRate: Math.max(0, annualRate) }),
  setTenureMonths: (tenureMonths) => set({ tenureMonths: Math.max(1, Math.round(tenureMonths)) }),
  setStartDate: (startDate) => set({ startDate }),
  setAdvanceEmis: (advanceEmis) => set({ advanceEmis: Math.max(0, Math.round(advanceEmis)) }),
  setFees: (fees) => set({ fees: Math.max(0, fees) }),
  setLoanType: (loanType) => set({ loanType }),
  setSolveFor: (solveFor) => set({ solveFor }),
  setEmi: (emi) => set({ emi: Math.max(0, emi) }),

  addEvent: (event) => set((s) => ({ events: [...s.events, event] })),
  updateEvent: (index, event) =>
    set((s) => ({ events: s.events.map((e, i) => (i === index ? event : e)) })),
  removeEvent: (index) => set((s) => ({ events: s.events.filter((_, i) => i !== index) })),
  clearEvents: () => set({ events: [] }),

  seedDefaults: ({ annualRate, tenureYears }) =>
    set((s) => ({
      annualRate,
      tenureMonths: Math.round(tenureYears * 12),
      revision: s.revision + 1,
    })),

  loadFrom: (input) =>
    set((s) => ({
      principal: input.principal,
      annualRate: input.annualRate,
      tenureMonths: input.tenureMonths,
      startDate: input.startDate ?? todayISO(),
      advanceEmis: input.advanceEmis ?? 0,
      fees: input.fees ?? 0,
      events: input.events ?? [],
      loanType: input.loanType ?? s.loanType,
      revision: s.revision + 1,
    })),

  toInput: () => {
    const s = get();
    return {
      principal: s.principal,
      annualRate: s.annualRate,
      tenureMonths: s.tenureMonths,
      startDate: s.startDate,
      advanceEmis: s.advanceEmis,
      fees: s.fees,
      events: s.events,
    };
  },
}));

/**
 * Amortisation inputs only. Wrapped in `useShallow` because the selector builds a fresh object every
 * render, and zustand v5 compares selector results by reference.
 */
export function useLoanInput(): LoanInput {
  return useCalculatorStore(
    useShallow((s) => ({
      principal: s.principal,
      annualRate: s.annualRate,
      tenureMonths: s.tenureMonths,
      startDate: s.startDate,
      advanceEmis: s.advanceEmis,
      fees: s.fees,
      events: s.events,
    })),
  );
}
