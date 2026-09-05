import { Hono } from 'hono';
import { z } from 'zod';

import type { AppEnv } from '../env';
import { verifyGoogleIdToken } from '../lib/google';
import { signJwt } from '../lib/jwt';

/** Long enough that the app rarely re-prompts, short enough to age out. */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

const bodySchema = z.object({ idToken: z.string().min(1) });

export const auth = new Hono<AppEnv>();

auth.post('/auth/google', async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const identity = await verifyGoogleIdToken(parsed.data.idToken, c.env.GOOGLE_CLIENT_ID);
  if (!identity) return c.json({ error: 'invalid_token' }, 401);

  const now = new Date().toISOString();
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE google_id = ?')
    .bind(identity.googleId)
    .first<{ id: string }>();

  const userId = existing?.id ?? crypto.randomUUID();

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE users SET email = ?, display_name = ?, updated_at = ? WHERE id = ?',
    )
      .bind(identity.email, identity.name, now, userId)
      .run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO users (id, google_id, email, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(userId, identity.googleId, identity.email, identity.name, now, now)
      .run();
  }

  const token = await signJwt(
    { sub: userId, email: identity.email },
    c.env.JWT_SECRET,
    SESSION_TTL_SECONDS,
  );

  return c.json({
    token,
    user: { id: userId, email: identity.email, name: identity.name },
  });
});
