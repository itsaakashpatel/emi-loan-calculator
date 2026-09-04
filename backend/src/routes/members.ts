import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../env';

const memberSchema = z.object({
  name: z.string().min(1).max(80),
  relation: z.enum(['self', 'spouse', 'child', 'parent', 'other']).nullish(),
  /** sha256 hex of the PAN. The app hashes it; the PAN never reaches us. */
  panHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullish(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

interface MemberRow {
  id: string;
  name: string;
  relation: string | null;
  pan_hash: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function toMember(row: MemberRow) {
  return {
    id: row.id,
    name: row.name,
    relation: row.relation,
    hasPan: row.pan_hash !== null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const members = new Hono<AppEnv>();

members.get('/members', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM members WHERE user_id = ? ORDER BY sort_order, created_at',
  )
    .bind(c.get('userId'))
    .all<MemberRow>();

  return c.json({ members: results.map(toMember) });
});

members.post('/members', async (c) => {
  const parsed = memberSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { name, relation, panHash, sortOrder } = parsed.data;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await c.env.DB.prepare(
    `INSERT INTO members (id, user_id, name, relation, pan_hash, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, c.get('userId'), name, relation ?? null, panHash ?? null, sortOrder ?? 0, now, now)
    .run();

  const row = await c.env.DB.prepare('SELECT * FROM members WHERE id = ?')
    .bind(id)
    .first<MemberRow>();

  return c.json({ member: toMember(row!) }, 201);
});

members.put('/members/:id', async (c) => {
  const parsed = memberSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { name, relation, panHash, sortOrder } = parsed.data;
  // Matching on user_id as well as id is what stops one user editing
  // another's member by guessing an id.
  const result = await c.env.DB.prepare(
    `UPDATE members SET name = ?, relation = ?, pan_hash = ?, sort_order = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      name,
      relation ?? null,
      panHash ?? null,
      sortOrder ?? 0,
      new Date().toISOString(),
      c.req.param('id'),
      c.get('userId'),
    )
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'not_found' }, 404);

  const row = await c.env.DB.prepare('SELECT * FROM members WHERE id = ?')
    .bind(c.req.param('id'))
    .first<MemberRow>();

  return c.json({ member: toMember(row!) });
});

members.delete('/members/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('userId');

  const owned = await c.env.DB.prepare('SELECT id FROM members WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ id: string }>();
  if (!owned) return c.json({ error: 'not_found' }, 404);

  // D1 does not enforce foreign keys, so the holdings have to go explicitly.
  // Batched so a member is never left half-deleted.
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM mf_holdings WHERE member_id = ? AND user_id = ?').bind(id, userId),
    c.env.DB.prepare('DELETE FROM stock_holdings WHERE member_id = ? AND user_id = ?').bind(
      id,
      userId,
    ),
    c.env.DB.prepare('DELETE FROM members WHERE id = ? AND user_id = ?').bind(id, userId),
  ]);

  return c.json({ ok: true });
});
