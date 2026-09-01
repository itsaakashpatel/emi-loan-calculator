import * as Notifications from 'expo-notifications';

import { emiReminders } from './lib/reminders';
import type { LoanWithProgress } from './store/loans';

/**
 * Local notifications for EMI due dates. The app is the only place these reminders are scheduled, so
 * a full cancel-and-reschedule on every change is enough to keep the set correct.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Replaces every scheduled reminder with the current set. Call it after the loans or the
 * notification time change. Skipped entirely when no open loan has a next due date, so a fresh
 * install never prompts for permission before there is something to remind about.
 */
export async function syncEmiReminders(
  items: LoanWithProgress[],
  notificationTime: string,
): Promise<void> {
  const open = items.filter((item) => !item.isClosed && item.nextDueDate !== null);

  if (open.length === 0) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }

  if (!(await ensurePermission())) return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const item of open) {
    const reminders = emiReminders({
      loanName: item.loan.name,
      nextDueDate: item.nextDueDate!,
      notificationTime,
    });
    for (const reminder of reminders) {
      await Notifications.scheduleNotificationAsync({
        content: { title: reminder.title, body: reminder.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.fireAt },
      });
    }
  }
}
