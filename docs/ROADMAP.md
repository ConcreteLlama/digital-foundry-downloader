# Roadmap

Set by the project owner, 2026-08-11. This is the intended order of work — don't jump
ahead to a later phase without checking in first.

## Phase 0 — Understand & document (this pass)

Read and document the existing monorepo (`ARCHITECTURE.md`), figure out what the new
site's auth and data look like (`DF_SITE_MIGRATION.md`), and get set up to start real
work. No functional code changes in this phase.

## Phase 1 — Update the tool for the new site

Get the tool working against the relaunched `digitalfoundry.net` again. Status as of
2026-08-14 (all on branch `feature/new-df-site`, uncommitted):

- [x] Replace the `sessionid`-cookie auth flow with the new `autologin`-cookie flow.
- [x] Rewrite the scraping layer (`df-fetcher.ts` and friends) against the new
  `/videos` / `/api/1.0/listing` structure.
- [x] Split content identity (`DfContentInfo.key`) from the cosmetic filename slug
  (`.name`), since the new site has no per-video URL to derive a stable slug from.
- [x] **DB/migration compatibility** — implemented and verified against the real dev
  DB: existing entries patched forward in place (rekeyed via cached `youtubeVideoId`
  where available), no forced full re-scan. See `DF_SITE_MIGRATION.md`'s
  "Implementation status" section.
- [ ] Run a real download through the download engine end-to-end (only header-level
  redirect checks done so far) — **on hold**: the project owner's IP got banned by DF's
  Cloudflare protection during the first live test (see the incident writeup at the top
  of `DF_SITE_MIGRATION.md`); do not make further requests to digitalfoundry.net without
  explicit sign-off.
- [x] Fixed the bug that caused the ban: `DfUserManager` rechecked auth unconditionally
  every 10 seconds forever, regardless of success - now only reschedules while signed
  in, at 30 minutes. Full timer audit done, no other unconditional loops hit the DF
  site. See `DF_SITE_MIGRATION.md`.
- [x] **`automaticDownloads.maxContentAgeHours`** — new config field (default 48h,
  hard-capped at 168h/one week, no unlimited option), gates auto-download by the
  content's own publish date in `checkForNewContents()`. Directly protects Digital
  Foundry's own infrastructure (a small team, not a large operation) from a
  cross-installation load spike if many self-hosted copies of this tool resume
  auto-downloading around the same upgrade window - not just a "my downloads folder"
  concern. See `DF_SITE_MIGRATION.md`.
- [x] **Resuming after upgrading to this version** — new `newSiteFirstScanComplete` DB
  flag suppresses auto-download entirely (on top of the age gate above) for an
  installation's first automatic scan against the new site, then flips permanently true.
  Not yet exercised live since the auto-poll loop itself still isn't wired into
  `start()` (next item). See `DF_SITE_MIGRATION.md`.
- [ ] Decide what becomes of the Patreon-import stopgap path once real scraping works
  again (keep as fallback vs retire).
- [x] `DfSessionCheckDialog` re-enabled, and `start()` now hard-gates the initial
  archive scan on confirmed DF auth (never scans unauthenticated, auto-triggers a scan
  the moment valid auth is configured via the UI). See `DF_SITE_MIGRATION.md`.
- [ ] The recurring auto-poll loop itself (periodic `checkForNewContents()`, as opposed
  to the one-time startup scan above) is still not wired up — blocked on the
  "resuming after upgrading" item above first.
- [x] **Centralized DF-site request queue + rate-limit backoff** (2026-08-15) — every
  request to digitalfoundry.net itself (not downloads) now goes through a single
  concurrency-1 queue with randomized spacing (`digitalFoundry.requestSpacingMinMs/MaxMs`,
  configurable, defaults 5-15s) and transparent 429/503 backoff-and-retry. Verified live
  against a real full archive scan - no rate-limit responses hit, and the live run
  surfaced/fixed two unrelated pre-existing scan-crashing bugs along the way. See
  `DF_SITE_MIGRATION.md`.

## Phase 2 — Replace yalc with npm workspaces (done)

**Superseded 2026-08-14**: a Next.js rewrite was considered but rejected — this app is
fundamentally a long-running background process (in-memory FSM task executions, a
priority download queue, a polling loop, all living in a singleton
`DigitalFoundryContentManager`), not a request/response workload. Next.js is
serverless/request-shaped by default; running persistent background state on it means
fighting the framework (custom server or `instrumentation.ts` bootstrap, HMR restarting
the loop in dev, docs/tooling that assume statelessness) for no real benefit here.

The actual pain point worth fixing was **yalc** — this session hit its rebuild/re-link
dance (`npm run build` in `df-downloader-common` → `npm run add-common` in each
consumer, "package not found in lockfile" errors) repeatedly while iterating.

**Done 2026-08-14**: migrated the monorepo to real npm workspaces (root `package.json`
`workspaces` field). `df-downloader-common` is now a live symlink for both consumers,
no publish/push step. Same three-package structure, same Express backend as a normal
long-running Node process, same FSM/task-manager core — untouched. Notable side effects
of the migration, not scope creep:
- `df-downloader-common`'s deep subpath imports (`df-downloader-common/config/x`) needed
  an explicit `exports` map once its package root stopped being yalc's flattened `dist/`
  copy; `df-downloader-service`'s `tsconfig.json` moved to `"moduleResolution": "bundler"`
  (matching the UI) so `tsc` respects that map.
- That resolution-mode change also made TS start enforcing other packages' own
  `exports` fields for deep imports - `deepgram.ts`'s deep import into
  `@deepgram/sdk/dist/types/*` (not part of that package's public exports) had to be
  replaced with types derived structurally from the SDK's public `Deepgram` class.
- `df-downloader-service/scripts/strip-ffprobe-binaries.cjs` hardcoded
  `df-downloader-service/node_modules/ffprobe-static` - under workspace hoisting that
  package lands in the root `node_modules` instead, so the script now resolves it via
  `require.resolve()`.
- The `Dockerfile` was rewritten around a single root `npm ci` (installing all three
  workspaces at once, with a Docker-layer-cache-friendly package.json-only copy first)
  instead of per-package `yalc add` + `npm ci` + `rimraf node_modules` stages. Verified
  with a real `docker build` + `docker run` in this session.
- The `date-fns`/`@mui/x-date-pickers` peer-dependency conflict noted earlier in this
  doc's history turned out to be *worse* than a one-time install issue: a from-scratch
  `npm install` would sometimes hoist a peer-satisfying `date-fns@3.6.0` to the repo
  root, but a second, completely redundant `npm install` on the same tree would prune
  it as "extraneous" (nothing formally depends on it, only an optional peer implies it),
  silently breaking `@mui/x-date-pickers` again. Neither strict resolution nor a scoped
  `overrides` entry survived a second install. Fixed by adding `date-fns@^3.6.0` as a
  genuine, explicit `dependencies` entry on the *root* `package.json` - since it's a real
  direct dependency now, npm always considers the hoisted copy required. Verified stable
  across three consecutive `npm install` runs. If this regresses again, check root
  `package.json`'s `dependencies` first before assuming a fresh install will fix it -
  a *second* install is exactly when this silently broke before.
