# AGENTS.md

This file guides AI agents that work in this repo. Read it before you change code.

## Follow the global CLAUDE.md

Read and follow `~/.claude/CLAUDE.md` first. Two rules from that file apply here:

- Write all user-facing text in ASD-STE100 Simplified Technical English.
- Pick the model for a workflow or subagent from the table in that file.

## Commands

Use `pnpm`. Do not use `npm` or `yarn`.

```bash
pnpm install
pnpm ios            # run in the iOS Simulator via Expo Go
pnpm test           # jest-expo, matches __tests__/**/*.test.ts
pnpm test -- emi.test.ts   # run one file
pnpm typecheck      # tsc --noEmit
pnpm doctor         # expo-doctor
```

Run `pnpm typecheck` and `pnpm test` after you change code. There is no lint or format script.

The Cloudflare Worker in `backend/` is a separate package with its own
dependencies and checks. Run both when you touch it:

```bash
cd backend
pnpm install
pnpm typecheck
pnpm test           # vitest
pnpm dev            # wrangler dev, on :8787
```

`.npmrc` pins `node-linker=hoisted`. Metro cannot resolve pnpm's symlinked `node_modules`. Do not remove this.

## Architecture

- Expo SDK 57, React Native 0.86.2, expo-router with `typedRoutes`. The app is iOS-only.
- `src/lib/finance` is the single source of truth for every number the UI and PDFs show. It is pure TypeScript with no React Native imports. Put all financial maths here.
- Schedules use integer paise arithmetic. Round each row to 2dp. Let the final instalment absorb the residual. Round the EMI up to the paisa.
- `@/*` resolves to the repo root.
- All investment calculators run from one registry, `src/lib/finance/calculators.ts`, rendered by one screen, `app/invest/[type].tsx`. Add a calculator as a registry entry, not a new screen.
- `src/db` holds the SQLite client, migrations, and repositories. `src/store` holds zustand state.
- EMI reminders: pure schedule logic lives in `src/lib/reminders.ts`; the expo-notifications glue is in `src/notifications.ts`, wired from `app/_layout.tsx`. The reminder time setting is stored as `HH:MM` under key `notification_time`.

## Portfolio

The Portfolio tab is the one part of the app that needs an account and a
network. Everything else works offline and must stay that way.

- The Cloudflare Worker in `backend/` owns the portfolio data. Its README covers the one-time account setup. `backend/src/lib` holds the AMFI, Yahoo and CAS readers; keep them pure and testable, as `src/lib/finance` is on the app side.
- The device keeps a read-only mirror in SQLite (migration v3). It is a cache: each sync replaces it wholesale, and signing out empties it. Never treat it as a source of truth or write to it outside `src/db/portfolio.ts`.
- Every holding's invested, current value and gain are computed on the server and stored with it, so the tab draws with no network call. Do not recompute them in the UI.
- `ApiError.isOffline` (status 0) means the request never reached the server, so cached data still stands. Only `isUnauthorized` should clear anything.
- The session token lives in the Keychain via expo-secure-store, never in SQLite.
- A PAN is hashed on the device. Only the hash is sent, and only to match CAS folios to a member.
- Sign-in needs two Google client IDs: iOS in the app, web as the token audience for the Worker. Until `app.json` carries them, the tab explains it is unconfigured.

## Currency and numbers

- INR is the only display currency, with Indian digit grouping. There is no currency selector.
- State the currency once per table header, not in every cell.
- Format money and dates through `src/lib/format`, not inline.

## Release and App Store

- App Store release uses the `asc` CLI. `ASC.md` documents it. Do not guess commands. Use `asc <command> --help`.
- `eas.json` holds the app ID `6801948279` and team ID `7L9982T9B6`.
- Store assets and metadata live in `store/`. Rebuild screenshots with Koubou. See `store/README.md`.
- Keep `app.json`, `package.json`, and store metadata on the same version.
