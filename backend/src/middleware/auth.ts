import type { MiddlewareHandler } from 'hono';

import type { AppEnv } from '../env';
import { verifyJwt } from '../lib/jwt';

/**
 * Gates every route except /health and /auth/*. Puts the caller's user id on
 * the context; routes read it with `c.get('userId')` and scope their queries
 * to it, which is what keeps one user's portfolio out of another's reach.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401);

  const payload = await verifyJwt(header.slice('Bearer '.length), c.env.JWT_SECRET);
  if (!payload) return c.json({ error: 'unauthorized' }, 401);

  c.set('userId', payload.sub);
  await next();
};
