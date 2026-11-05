/**
 * What the "Next EMI" widget shows. The widget runs outside the app and cannot call the app's
 * formatters, so every string is formatted here. One timeline entry per day keeps "due in 3 days"
 * correct while the app stays closed.
 *
 * Pure TypeScript, no React Native imports.
 */

import { addDays, compareISO, daysBetween, formatDate } from './format/date';
import { formatMoney } from './format/money';

export interface WidgetLoan {
  id: number;
  name: string;
  closed: boolean;
  outstanding: number;
  /** Unpaid instalments in due-date order: date and amount. */
  pending: ReadonlyArray<{ date: string; amount: number }>;
}

export type NextEmiState = 'none' | 'due' | 'overdue' | 'clear' | 'locked';

export interface NextEmiProps {
  state: NextEmiState;
  /** Short line at the top: "Next EMI", "Overdue", or a message. */
  title: string;
  loanName: string;
  amount: string;
  /** "12 Dec 2026". */
  dueDate: string;
  /** "Due in 3 days", "Due today", "2 days late". */
  dueLabel: string;
  /** "₹42,10,000 left on 2 loans". */
  footer: string;
  /** Deep link the widget opens. */
  url: string;
}

const LOANS_URL = 'emicalc://loans';

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The widget's content on `day`, from the loans as they stand. */
export function nextEmiProps(loans: readonly WidgetLoan[], day: string, locked = false): NextEmiProps {
  const blank = { loanName: '', amount: '', dueDate: '', dueLabel: '', footer: '', url: LOANS_URL };
  if (locked) {
    return { ...blank, state: 'locked', title: 'EMI Calculator is locked', footer: 'Open the app to see your next EMI.' };
  }

  const open = loans.filter((loan) => !loan.closed);
  if (loans.length === 0) {
    return { ...blank, state: 'none', title: 'No loans saved', footer: 'Save a loan to see its next EMI here.' };
  }
  if (open.length === 0) {
    return { ...blank, state: 'clear', title: 'All loans repaid', footer: 'You have no EMI to pay.' };
  }

  // The earliest unpaid instalment across every open loan. Overdue ones come first by date.
  let best: { loan: WidgetLoan; date: string; amount: number } | null = null;
  for (const loan of open) {
    const first = loan.pending[0];
    if (first && (best === null || compareISO(first.date, best.date) < 0)) {
      best = { loan, date: first.date, amount: first.amount };
    }
  }
  const outstanding = open.reduce((sum, loan) => sum + loan.outstanding, 0);
  const footer = `${formatMoney(outstanding)} left on ${plural(open.length, 'loan')}`;
  if (!best) return { ...blank, state: 'clear', title: 'All loans repaid', footer };

  const days = daysBetween(day, best.date);
  const overdue = days < 0;
  return {
    state: overdue ? 'overdue' : 'due',
    title: overdue ? 'EMI overdue' : 'Next EMI',
    loanName: best.loan.name,
    amount: formatMoney(best.amount),
    dueDate: formatDate(best.date),
    dueLabel: overdue
      ? `${plural(-days, 'day')} late`
      : days === 0
        ? 'Due today'
        : days === 1
          ? 'Due tomorrow'
          : `Due in ${days} days`,
    footer,
    url: `emicalc://loan/${best.loan.id}`,
  };
}

/** One entry for each of the next `days` days, starting `today`. */
export function nextEmiTimeline(
  loans: readonly WidgetLoan[],
  today: string,
  locked = false,
  days = 14,
): Array<{ day: string; props: NextEmiProps }> {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i);
    return { day, props: nextEmiProps(loans, day, locked) };
  });
}
