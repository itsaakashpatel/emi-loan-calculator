import { emiReminders, formatTime, parseTime } from '../src/lib/reminders';

function localDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(year, month - 1, day, hour, minute);
}

describe('emiReminders', () => {
  const nextDueDate = '2026-09-08';

  it('schedules three days before, on, and one after the due date', () => {
    const reminders = emiReminders({
      loanName: 'Home loan',
      nextDueDate,
      notificationTime: '19:00',
      now: localDate(2026, 9, 1, 12, 0),
    });

    expect(reminders.map((r) => r.fireAt.getDate())).toEqual([6, 7, 8, 9]);
    expect(reminders.every((r) => r.fireAt.getHours() === 19 && r.fireAt.getMinutes() === 0)).toBe(true);
  });

  it('names the loan in the reminder and the overdue follow-up', () => {
    const reminders = emiReminders({
      loanName: 'Car loan',
      nextDueDate,
      notificationTime: '19:00',
      now: localDate(2026, 9, 1, 12, 0),
    });

    const due = reminders[0]!;
    const overdue = reminders[3]!;
    expect(due.body).toBe("It's time to pay your EMI for Car loan.");
    expect(overdue.body).toBe("Have you paid your EMI for Car loan? It's overdue.");
  });

  it('drops reminders that are already in the past', () => {
    // Due today at 10am: the two days before and today's earlier slot have passed.
    const reminders = emiReminders({
      loanName: 'Home loan',
      nextDueDate,
      notificationTime: '19:00',
      now: localDate(2026, 9, 8, 10, 0),
    });
    expect(reminders.map((r) => r.fireAt.getDate())).toEqual([8, 9]);
  });

  it('leaves only the overdue follow-up once the day passes', () => {
    const reminders = emiReminders({
      loanName: 'Home loan',
      nextDueDate,
      notificationTime: '19:00',
      now: localDate(2026, 9, 9, 8, 0),
    });
    expect(reminders).toHaveLength(1);
    expect(reminders[0]!.fireAt.getDate()).toBe(9);
  });
});

describe('parseTime and formatTime', () => {
  it('parses 24-hour clock and falls back to 19:00 on bad input', () => {
    expect(parseTime('19:00')).toEqual([19, 0]);
    expect(parseTime('07:05')).toEqual([7, 5]);
    expect(parseTime('7:05')).toEqual([7, 5]);
    expect(parseTime('bad')).toEqual([19, 0]);
    expect(parseTime('25:00')).toEqual([19, 0]);
  });

  it('formats for display', () => {
    expect(formatTime('19:00')).toBe('7:00 PM');
    expect(formatTime('00:30')).toBe('12:30 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
  });
});
