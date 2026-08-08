import { getDb } from './client';

/** Tiny key/value table for app settings. Values are stored as strings. */

export async function readAllSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM kv_settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function writeSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO kv_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export async function clearSettings(): Promise<void> {
  const db = await getDb();
  await db.execAsync('DELETE FROM kv_settings');
}
