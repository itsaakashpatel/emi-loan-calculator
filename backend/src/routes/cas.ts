import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../env';
import { fetchIsinIndex } from '../lib/amfi';
import {
  extractPdfText,
  parseCasText,
  resolveCasHoldings,
  type ResolvedCasHolding,
} from '../lib/cas-parser';

/** Statements run to a few hundred KB; well past that is not a CAS. */
const MAX_PDF_BYTES = 15 * 1024 * 1024;

const confirmSchema = z.object({
  /** Indices into the parsed list the user chose to keep. */
  accept: z.array(z.number().int().nonnegative()).max(500),
});

interface UploadRow {
  id: string;
  member_id: string | null;
  r2_key: string;
  status: string;
  error: string | null;
  holdings_json: string | null;
  holdings_count: number | null;
}

/** The ISIN index, or an empty one when AMFI cannot be reached. */
async function isinIndexOrEmpty(): Promise<
  ReadonlyMap<string, { amfiCode: string; schemeName: string }>
> {
  try {
    return await fetchIsinIndex();
  } catch (error) {
    console.error('isin index unavailable', error);
    return new Map();
  }
}

export const cas = new Hono<AppEnv>();

cas.post('/cas/upload', async (c) => {
  const userId = c.get('userId');

  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  const memberId = form?.get('memberId');
  // Structural check rather than `instanceof File`: the Workers runtime types
  // expose File as a type only, so instanceof does not narrow here.
  const isFile =
    file !== null && typeof file === 'object' && typeof (file as Blob).arrayBuffer === 'function';
  if (!isFile || typeof memberId !== 'string') {
    return c.json({ error: 'invalid_body' }, 400);
  }
  const upload = file as Blob;
  if (upload.size > MAX_PDF_BYTES) return c.json({ error: 'file_too_large' }, 413);

  const owned = await c.env.DB.prepare('SELECT id FROM members WHERE id = ? AND user_id = ?')
    .bind(memberId, userId)
    .first<{ id: string }>();
  if (!owned) return c.json({ error: 'not_found' }, 404);

  const uploadId = crypto.randomUUID();
  const r2Key = `cas/${userId}/${uploadId}.pdf`;
  const bytes = new Uint8Array(await upload.arrayBuffer());

  // Kept only until parsing finishes. The bucket also expires this prefix
  // after a day, so a parse that dies still leaves nothing behind.
  await c.env.CAS_BUCKET.put(r2Key, bytes);
  await c.env.DB.prepare(
    `INSERT INTO cas_uploads (id, user_id, member_id, r2_key, status, created_at)
     VALUES (?, ?, ?, ?, 'processing', ?)`,
  )
    .bind(uploadId, userId, memberId, r2Key, new Date().toISOString())
    .run();

  try {
    const text = await extractPdfText(bytes);
    const parsed = parseCasText(text);
    if (parsed.length === 0) {
      throw new Error('no holdings found — is this a mutual fund CAS?');
    }

    // Resolution is best-effort. AMFI being unreachable must not throw away a
    // statement that parsed cleanly: the holdings are still worth showing, and
    // confirming re-tries the lookup for anything still unresolved.
    const resolved = resolveCasHoldings(parsed, await isinIndexOrEmpty());

    await c.env.DB.prepare(
      `UPDATE cas_uploads
       SET status = 'parsed', holdings_json = ?, holdings_count = ?, processed_at = ?
       WHERE id = ?`,
    )
      .bind(JSON.stringify(resolved), resolved.length, new Date().toISOString(), uploadId)
      .run();

    // The PDF has served its purpose; nothing reads it again.
    await c.env.CAS_BUCKET.delete(r2Key);

    return c.json({ uploadId, status: 'parsed', holdings: resolved });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'could not read the statement';
    await c.env.DB.prepare(
      `UPDATE cas_uploads SET status = 'failed', error = ?, processed_at = ? WHERE id = ?`,
    )
      .bind(message, new Date().toISOString(), uploadId)
      .run();
    await c.env.CAS_BUCKET.delete(r2Key).catch(() => undefined);

    return c.json({ uploadId, status: 'failed', error: message }, 422);
  }
});

cas.get('/cas/upload/:id', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM cas_uploads WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('userId'))
    .first<UploadRow>();
  if (!row) return c.json({ error: 'not_found' }, 404);

  return c.json({
    uploadId: row.id,
    status: row.status,
    error: row.error,
    holdingsCount: row.holdings_count,
    holdings: row.holdings_json ? JSON.parse(row.holdings_json) : null,
  });
});

cas.post('/cas/upload/:id/confirm', async (c) => {
  const parsed = confirmSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const userId = c.get('userId');
  const row = await c.env.DB.prepare('SELECT * FROM cas_uploads WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('userId'))
    .first<UploadRow>();
  if (!row || !row.holdings_json || !row.member_id) return c.json({ error: 'not_found' }, 404);
  if (row.status === 'imported') return c.json({ error: 'already_imported' }, 409);

  const holdings = JSON.parse(row.holdings_json) as ResolvedCasHolding[];

  const picked = parsed.data.accept
    .map((index) => holdings[index])
    .filter((holding): holding is ResolvedCasHolding => holding !== undefined);

  // Upload-time resolution is allowed to fail, so retry here for anything
  // still unresolved rather than discarding it on a stale lookup.
  const chosen = picked.some((holding) => holding.amfiCode === null)
    ? resolveCasHoldings(picked, await isinIndexOrEmpty())
    : picked;

  // A scheme AMFI still does not list has no code to price it by, so it
  // cannot be stored. The response reports it as skipped and the user can add
  // it by hand.
  const storable = chosen.filter((holding) => holding.amfiCode !== null);

  const now = new Date().toISOString();
  const statements = storable.map((holding) =>
    c.env.DB.prepare(
      `INSERT INTO mf_holdings
         (id, member_id, user_id, amfi_code, scheme_name, folio_number, units,
          avg_nav, invested_value, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'cas', ?, ?)
       ON CONFLICT(member_id, amfi_code, IFNULL(folio_number, '')) DO UPDATE SET
         units = excluded.units,
         scheme_name = excluded.scheme_name,
         invested_value = excluded.invested_value,
         source = 'cas',
         updated_at = excluded.updated_at`,
    ).bind(
      crypto.randomUUID(),
      row.member_id,
      userId,
      holding.amfiCode,
      holding.schemeName,
      holding.folioNumber,
      holding.units,
      holding.navOnDate,
      holding.marketValue,
      now,
      now,
    ),
  );

  if (statements.length > 0) await c.env.DB.batch(statements);

  await c.env.DB.prepare('UPDATE cas_uploads SET status = ? WHERE id = ?')
    .bind('imported', row.id)
    .run();

  return c.json({
    imported: statements.length,
    skipped: parsed.data.accept.length - statements.length,
  });
});
