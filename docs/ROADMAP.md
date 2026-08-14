# Roadmap

Set by the project owner, 2026-08-11. This is the intended order of work — don't jump
ahead to a later phase without checking in first, especially Phase 2 which is explicitly
optional/not committed to.

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

## Phase 2 — Replace yalc with npm workspaces (optional, not committed)

**Superseded 2026-08-14**: a Next.js rewrite was considered but rejected — this app is
fundamentally a long-running background process (in-memory FSM task executions, a
priority download queue, a polling loop, all living in a singleton
`DigitalFoundryContentManager`), not a request/response workload. Next.js is
serverless/request-shaped by default; running persistent background state on it means
fighting the framework (custom server or `instrumentation.ts` bootstrap, HMR restarting
the loop in dev, docs/tooling that assume statelessness) for no real benefit here.

The actual pain point worth fixing is **yalc** — this session hit its rebuild/re-link
dance (`npm run build` in `df-downloader-common` → `npm run add-common` in each
consumer, "package not found in lockfile" errors) repeatedly while iterating. Migrating
the monorepo to real npm workspaces would fix that directly: consumers get a live
symlink to `df-downloader-common` with no publish/push step, while keeping the same
three-package structure, the same Express backend as a normal long-running Node
process, and the same FSM/task-manager core untouched. Much smaller blast radius than a
framework rewrite, and still optional/secondary to Phase 1 — don't start scoping this
until Phase 1 is done and stable.
