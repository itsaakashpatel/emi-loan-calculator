import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { readBackupData, restoreBackupData } from './db/backup';
import { BackupError, backupFileName, parseBackup, serialiseBackup, type BackupFile } from './lib/backup';
import { todayISO } from './lib/format/date';

/**
 * Writes a backup to the cache directory and opens the share sheet, so the user can save it to
 * Files, iCloud Drive or another device. Nothing leaves the phone unless the user sends it.
 */
export async function shareBackup(): Promise<void> {
  const data = await readBackupData();
  const text = serialiseBackup({
    exportedAt: new Date().toISOString(),
    appVersion: Constants.expoConfig?.version ?? '',
    ...data,
  });

  const file = new File(Paths.cache, backupFileName(todayISO()));
  if (file.exists) file.delete();
  file.create();
  file.write(text);

  if (!(await Sharing.isAvailableAsync())) {
    throw new BackupError('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Save backup',
  });
}

/** Opens the Files picker and reads a backup. `null` when the user cancels. */
export async function pickBackup(): Promise<BackupFile | null> {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'text/plain'] });
  if (picked.canceled || !picked.result) return null;
  return parseBackup(await picked.result.text());
}

export async function restoreBackup(backup: BackupFile): Promise<void> {
  await restoreBackupData(backup);
}
