import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { AppEnv, Env } from './env';
import { health } from './routes/health';

const app = new Hono<AppEnv>();

app.use('*', cors());

app.route('/', health);

app.notFound((c) => c.json({ error: 'not_found' }, 404));

app.onError((err, c) => {
  console.error('unhandled', err);
  return c.json({ error: 'internal_error' }, 500);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
