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

## Google sign-in

Create both OAuth client IDs once, in the Google Cloud console under
**APIs & Services → Credentials**:

| Client type | Configure with | Goes in |
| --- | --- | --- |
| iOS | Bundle ID `com.aakashpatel.emicalculator` | `app.json` → `extra.googleIosClientId` |
| Web | No redirect URIs needed | `app.json` → `extra.googleWebClientId`, and `wrangler secret put GOOGLE_CLIENT_ID` |

Then set `extra.portfolioApiUrl` in `app.json` to this Worker's URL.

Neither client ID is a secret — a public OAuth client ID is meant to ship
inside the app. What protects the data is this API verifying the token, so the
signing secret stays here and only here.

Until all three values are filled in, the app's Portfolio tab explains that it
is unconfigured rather than showing a sign-in button that cannot work.

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

## CAS import

A Consolidated Account Statement is read in two steps, both on Workers AI
(the `AI` binding in `wrangler.toml`):

1. `env.AI.toMarkdown()` converts the PDF to markdown.
2. A model reads the markdown into a fixed JSON schema.

The model can be wrong, so its answer is never trusted. `src/lib/grounding.ts`
checks every number, ISIN, folio and scheme name against the markdown. A row
that the document does not support is dropped, and the count is logged. Keep
this check. It is the only thing that stops an invented figure from reaching a
portfolio.

Local `wrangler dev` runs the AI binding against Cloudflare, so it needs
`wrangler login` and it uses your account's Workers AI quota.

## Plan

The import waits on Workers AI and does little work in the Worker itself. Check
the current Workers AI and Workers limits on Cloudflare's pricing page before
you pick a plan. `wrangler.toml` asks for 30 s of CPU per invocation as a
margin, and the free tier does not allow that.
