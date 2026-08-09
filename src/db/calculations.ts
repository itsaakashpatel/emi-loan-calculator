import { getDb } from './client';

/** Rows kept per `kind` — older entries are pruned on insert. */
const MAX_ROWS_PER_KIND = 50;

export interface SavedCalculation {
  id: number;
  kind: string;
  title: string;
  inputs: Record<string, unknown>;
  createdAt: string;
}

interface CalculationRow {
  id: number;
  kind: string;
  title: string;
  inputs_json: string;
  created_at: string;
}

function rowToCalculation(row: CalculationRow): SavedCalculation | null {
  try {
    const inputs = JSON.parse(row.inputs_json) as Record<string, unknown>;
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      inputs,
      createdAt: row.created_at,
    };
  } catch {
    // A corrupt row must not break the whole list — skip it.
    return null;
  }
}

/**
 * Saves a calculation, de-duplicating against the most recent entry of the same `kind` (users nudge
 * sliders constantly, which would otherwise flood history with near-identical rows) and pruning older
 * rows so at most `MAX_ROWS_PER_KIND` are kept per kind.
 *
 * Returns the id of the newly inserted row, or the existing row's id when the save was a duplicate.
 */
export async function saveCalculation(kind: string, title: string, inputs: object): Promise<number> {
  const db = await getDb();
  const inputsJson = JSON.stringify(inputs);

  const latest = await db.getFirstAsync<{ id: number; inputs_json: string }>(
    'SELECT id, inputs_json FROM saved_calculations WHERE kind = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    kind,
  );
  if (latest && latest.inputs_json === inputsJson) {
    return latest.id;
  }

  const result = await db.runAsync(
    'INSERT INTO saved_calculations (kind, title, inputs_json, created_at) VALUES (?, ?, ?, ?)',
    kind,
    title,
    inputsJson,
    new Date().toISOString(),
  );

  // Keep only the most recent MAX_ROWS_PER_KIND rows for this kind.
  await db.runAsync(
    `DELETE FROM saved_calculations
     WHERE kind = ?
       AND id NOT IN (
         SELECT id FROM saved_calculations WHERE kind = ? ORDER BY created_at DESC, id DESC LIMIT ?
       )`,
    kind,
    kind,
    MAX_ROWS_PER_KIND,
  );

  return result.lastInsertRowId;
}

/** Lists saved calculations, newest first. Filters by `kind` when given. Corrupt rows are skipped. */
export async function listCalculations(kind?: string): Promise<SavedCalculation[]> {
  const db = await getDb();
  const rows = kind
    ? await db.getAllAsync<CalculationRow>(
        'SELECT * FROM saved_calculations WHERE kind = ? ORDER BY created_at DESC, id DESC',
        kind,
      )
    : await db.getAllAsync<CalculationRow>('SELECT * FROM saved_calculations ORDER BY created_at DESC, id DESC');

  const result: SavedCalculation[] = [];
  for (const row of rows) {
    const parsed = rowToCalculation(row);
    if (parsed) result.push(parsed);
  }
  return result;
}

export async function deleteCalculation(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM saved_calculations WHERE id = ?', id);
}

/** Clears saved calculations. Restricts to `kind` when given, otherwise clears everything. */
export async function clearCalculations(kind?: string): Promise<void> {
  const db = await getDb();
  if (kind) {
    await db.runAsync('DELETE FROM saved_calculations WHERE kind = ?', kind);
  } else {
    await db.execAsync('DELETE FROM saved_calculations');
  }
}
