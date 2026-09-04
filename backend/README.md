# emi-portfolio-api

Cloudflare Worker backing the app's Portfolio tab. It holds the family
portfolio (members, mutual fund and stock holdings), refreshes NAVs and stock
prices once a day, and parses uploaded CAS statements.

The app keeps a read-only SQLite mirror of this data so the Portfolio tab still
renders offline. This API is the source of truth.

## Layout

| Path | Holds |
| --- | --- |
| `src/index.ts` | Worker entry: HTTP router and the cron handler |
| `src/env.ts` | Binding and context types |
| `src/routes/` | One file per route group |
| `src/lib/` | JWT, AMFI, Yahoo and CAS parsing helpers |
| `src/db/` | D1 schema and migrations |

## First-time setup

Everything below runs once, per Cloudflare account.

```sh
pnpm install

# Create the database, then paste the printed database_id into wrangler.toml.
npx wrangler d1 create emi-portfolio

# Create the bucket that holds CAS uploads while they are parsed.
npx wrangler r2 bucket create cas-uploads

# Delete uploads a day after they land, in case a parse never finishes.
npx wrangler r2 bucket lifecycle add cas-uploads \
  --prefix cas/ --expire-days 1

npx wrangler secret put GOOGLE_CLIENT_ID   # Google OAuth *web* client ID
npx wrangler secret put JWT_SECRET         # e.g. `openssl rand -base64 48`

pnpm db:apply:remote
pnpm deploy
```

`GOOGLE_CLIENT_ID` is the **web** client ID from the Google Cloud console, not
the iOS one. The app signs in with the iOS client and sends the resulting ID
token here; Google issues that token with the web client as its audience.

## Local development

```sh
pnpm db:apply:local
pnpm dev                      # http://localhost:8787
curl localhost:8787/health
```

Local secrets go in `backend/.dev.vars`, which git ignores:

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
JWT_SECRET=any-string-for-local-use
```

Fire the daily refresh by hand:

```sh
curl "localhost:8787/__scheduled?cron=0+2+*+*+*"
```

## Plan

CAS parsing reads a whole PDF and does not fit the free tier's 10 ms CPU limit,
so this Worker needs Workers Paid. `wrangler.toml` asks for 30 s of CPU per
invocation.
