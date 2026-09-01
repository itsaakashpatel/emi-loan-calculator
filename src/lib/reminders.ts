import { addDays } from './format/date';

/**
 * The EMI reminder dates and messages for one loan's next unpaid instalment.
 *
 * The reminder window is the due date minus 2 days, minus 1 day, and the due date itself. One more
 * fires the day after the due date if the instalment is still unpaid. Everything is pure so the
 * schedule is unit-testable without the notifications module.
 */

export interface EmiReminder {
  /** Local date and time the notification should fire. */
  fireAt: Date;
  title: string;
  body: string;
}

export function parseTime(value: string): [number, number] {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return [19, 0];
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return [19, 0];
  return [hour, minute];
}

/** `19:00` -> `7:00 PM`. */
export function formatTime(value: string): string {
  const [hour, minute] = parseTime(value);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function emiReminders({
  loanName,
  nextDueDate,
  notificationTime,
  now = new Date(),
}: {
  loanName: string;
  nextDueDate: string;
  notificationTime: string;
  now?: Date;
}): EmiReminder[] {
  const [hour, minute] = parseTime(notificationTime);
  const due = `It's time to pay your EMI for ${loanName}.`;
  const overdue = `Have you paid your EMI for ${loanName}? It's overdue.`;

  const offsets: ReadonlyArray<{ days: number; title: string; body: string }> = [
    { days: -2, title: 'EMI reminder', body: due },
    { days: -1, title: 'EMI reminder', body: due },
    { days: 0, title: 'EMI due today', body: due },
    { days: 1, title: 'EMI overdue', body: overdue },
  ];

  return offsets
    .map(({ days, title, body }) => {
      const [y, m, d] = addDays(nextDueDate, days).split('-').map(Number);
      return { fireAt: new Date(y!, m! - 1, d!, hour, minute), title, body };
    })
    .filter((reminder) => reminder.fireAt.getTime() > now.getTime());
}
