import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppEnv, Env } from './env';
import { requireAuth } from './middleware/auth';
import { auth } from './routes/auth';
import { cas } from './routes/cas';
import { health } from './routes/health';
import { holdings } from './routes/holdings';
import { members } from './routes/members';
import { prices } from './routes/prices';

const app = new Hono<AppEnv>();

app.use('*', cors());

app.route('/', health);
app.route('/', auth);

// Everything past this point needs a session token. Both patterns per group:
// Hono's `/members/*` matches `/members/abc` but not a bare `/members`.
for (const group of ['members', 'holdings', 'prices', 'schemes', 'cas']) {
  app.use(`/${group}`, requireAuth);
  app.use(`/${group}/*`, requireAuth);
}

app.route('/', members);
app.route('/', holdings);
app.route('/', prices);
app.route('/', cas);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
