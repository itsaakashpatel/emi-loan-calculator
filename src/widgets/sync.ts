import { Platform } from 'react-native';

import { nextEmiTimeline, type WidgetLoan } from '../lib/widget-data';
import { parseISO, todayISO } from '../lib/format/date';
import type { LoanWithProgress } from '../store/loans';

/** The saved loans, cut down to what the widget needs. */
export function widgetLoans(items: readonly LoanWithProgress[]): WidgetLoan[] {
  return items.map((item) => {
    const paid = new Set(item.payments.filter((p) => p.paidDate !== null).map((p) => p.installmentNo));
    return {
      id: item.loan.id,
      name: item.loan.name,
      closed: item.isClosed,
      outstanding: item.outstanding,
      pending: item.result.schedule
        .filter((row) => !paid.has(row.no))
        .slice(0, 1)
        .map((row) => ({ date: row.date, amount: row.emi + row.prepayment })),
    };
  });
}

/**
 * Pushes the next two weeks of widget content to WidgetKit. Each entry starts at local midnight, so
 * the "due in N days" line changes over at the start of each day. A failure here must never reach
 * the app: the widget is a convenience.
 */
export async function syncWidget(items: readonly LoanWithProgress[], locked: boolean): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    const { NextEmiWidget } = await import('./NextEmiWidget');
    const entries = nextEmiTimeline(widgetLoans(items), todayISO(), locked).map(({ day, props }) => {
      const { year, month, day: date } = parseISO(day);
      return { date: new Date(year, month - 1, date), props };
    });
    NextEmiWidget.updateTimeline(entries);
  } catch {
    // No widget extension in this build (Expo Go, or a simulator without it).
  }
}
