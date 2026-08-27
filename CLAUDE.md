# CLAUDE.md

Project-specific guidance for working on DF Downloader. Read `docs/ARCHITECTURE.md` and
`docs/DF_SITE_MIGRATION.md` before making non-trivial changes — this file is a summary
and pointer, not a replacement for them. `docs/ROADMAP.md` has the current phase plan.

## What this project is

A personal tool (nodejs + React) that scrapes Digital Foundry's members-only video
archive and downloads videos the user has Patreon access to, injecting metadata,
generating subtitles, etc. Not a general-purpose product — built by and for one person
(the repo owner) who shares it publicly. Keep that in mind for scope: prefer pragmatic
fixes over enterprise-grade abstraction, and don't add config/features speculatively.

## Current state (as of 2026-08-19) — read this first

**Branch state**: `main`, `develop`, and `experimental` are all byte-identical as of
2026-08-19 (fast-forwarded together, commit `8864a9f`) — Phase 1 plus the full
stabilization pass below are live on all three, and on DockerHub's `latest`/`development`/
`experimental` tags. New work happens on fresh branches off `main`
(`feature/youtube-metadata-drift`, `feature/youtube-subtitle-extraction` already created
empty, ready to check out) — see `docs/ROADMAP.md`'s Phase 3 for what's queued next and
why it's structured that way.

Digital Foundry left their old host and relaunched independently at
`digitalfoundry.net` with an entirely different CMS, HTML structure, and auth
mechanism. This broke the tool's scraper. As a stopgap (~Sept 2025), automated DF-site
scanning was disabled and a manual "paste HTML from the Patreon posts page" import path
was added instead. The new site relaunched its video archive as of 2026-08-11, making
real scraping viable again — see `docs/DF_SITE_MIGRATION.md` for the reverse-engineered
auth/listing/download mechanics. **The Patreon-import stopgap was retired and removed
entirely on 2026-08-15**, now that real scraping and downloads are confirmed working -
the still-useful "manual single-URL download" path was kept (`components/df-content/manual-download-tab`
+ `POST /api/tasks/manual`), just no longer tab-paired with the HTML-paste importer.

**Phase 1** of `docs/ROADMAP.md` (update the tool for the new site) is complete,
committed, and pushed live to the `experimental` DockerHub tag, running on the project
owner's real Unraid deployment. The fetcher/content-manager rewrite,
`DfContentInfo.key`/`.name` identity split, DB migration with a `legacy`/`unpatchable`
resolution mechanism for carried-over entries (a resumable full archive walk, not
per-item searching - see `docs/DF_SITE_MIGRATION.md`), the centralized rate-limited
request queue, and the recurring auto-poll loop
(`DigitalFoundryContentManager.start()` now calls `checkForNewContents()` on a
conservative timer, gated on sign-in status - see `contentDetection.contentCheckInterval`)
are all done and verified live. Phase 2 (yalc → npm workspaces migration) is done
(2026-08-14).

**Stabilization pass (2026-08-16 to 2026-08-18)**, driven by live testing against the
real Unraid deployment, on top of the Phase 1 work above:
- **Auth/session UX**: the "Test Session ID" button now surfaces the actual error
  message instead of just turning red; existing installs upgrading with a stale/invalid
  cookie already in `config.yaml` now correctly get prompted (the startup auth check is
  async and slower than the first `/df-user` query, so the UI re-polls briefly and
  self-corrects); a request-sequencing bug where a background poll could clobber a
  just-saved valid session with stale data was fixed by making the save flow
  authoritative and pausing the background poll while it's in flight.
- **Request queue**: `dfFetch()` gained `priority` (interactive actions jump queued
  bulk/background work) and `bypassQueue` (a genuine one-off — the manual download
  button specifically, not auto-download, which can fire several near-simultaneous
  items) options - see `df-request-queue.ts`. A small nav-bar badge
  (`QueueStatusIndicator`) now shows queue depth/backoff/scan status, since the queue's
  own protections mean actions can visibly pause with no explanation otherwise.
- **Legacy content**: downloading an entry whose data hasn't been confirmed against the
  live site (`DfContentInfo.legacy`) is now blocked both in the UI (disabled button,
  explanatory tooltip) and the service (`downloadContent()`), since its cached download
  link is likely dead - "Refresh Metadata" is the recovery path, and that action now
  also gets `bypassQueue`-equivalent priority.
- **YouTube description/duration**: the new site's listing never exposes either field.
  Both are lazily backfilled from YouTube (`syncYtVideoMeta` in
  `utils/youtube/sync-yt-video-meta.ts`) - on content-detail dialog open, before
  checking an auto-download candidate against a description-based exclusion filter, and
  always at download completion (alongside the pre-existing chapter-fetch, which can't
  be cached the way description/duration can - chapters are embedded fresh into every
  file, never persisted). Cached in the DB after first fetch; never eager during scans.
  `setContentInfos()` now merges this YouTube-sourced data across writes instead of
  letting a fresh DF-scraped overwrite silently wipe it.
- Fixed a userTierChanged()/archive-scan contention bug affecting every existing install
  upgrading (pasting a fresh cookie into an already-running app raced the scan it
  triggers), and hardened scan/refresh/download paths to hard no-op while signed out.

## Repo layout

Three-package monorepo, linked via **npm workspaces** (root `package.json`'s
`workspaces` field; yalc was removed 2026-08-14):
- `df-downloader-common/` — shared zod schemas/types/utils, source of truth for the
  domain model.
- `df-downloader-service/` — Express backend (scraping, downloads, task queue, REST
  API).
- `df-downloader-ui/` — React admin SPA.

Full detail in `docs/ARCHITECTURE.md`.

## Build / dev commands

From repo root (`package.json` orchestrates the sub-packages, a single `npm install`
installs and hoists deps for all three into the root `node_modules`):
```
npm install                # first-time setup, installs deps for all 3 workspaces
npm run build               # full build: common -> ui -> service (bundles UI into service's public/)
npm run dev:service        # nodemon-driven service dev server (needs df-downloader-service/dev.env, copy from dev.env.sample)
npm run dev:ui              # vite dev server for the UI
npm run check-build        # tsc --noEmit across all 3 workspaces
```
`node_modules` are not pre-installed in this checkout — run `npm install` at the repo
root before trying to build/typecheck (there is no more per-package install step).

`df-downloader-common` is a real workspace symlink now (`node_modules/df-downloader-common`
points straight at the package dir) — editing it and re-running its `npm run build`
(or `npm run watch`) is immediately visible to consumers, no publish/link step needed.
Its `package.json` `exports` field maps both extensioned (`df-downloader-common/config/x.js`,
used by the service's ESM-style imports) and extensionless (`df-downloader-common/config/x`,
used by the UI) deep subpath imports to `dist/*` — if you add a new subpath-imported file,
no extra wiring is needed, the wildcard pattern already covers it. The service's
`tsconfig.json` uses `"moduleResolution": "bundler"` (matching the UI) specifically so
`tsc` honors that exports map; if you add a new deep import into a *third-party*
node_modules package, check the target package's own `package.json` `exports` field
first — reaching into paths it doesn't explicitly export will fail to resolve under
bundler-mode resolution even if the file physically exists on disk (this bit us once
with `@deepgram/sdk`, see `deepgram.ts`).

## Conventions worth knowing

- **`df-downloader-common` is the contract.** Add/change a model or config field there
  first; both service and UI consume it, and the UI's settings forms are largely
  auto-generated from the config zod schemas (`DfSettingsSectionForm` +
  `zod-fields/`), so a lot of "add a config option" work is just editing the schema.
- **DB migrations are versioned and self-patching**, not ad-hoc scripts — see
  `FileDb`/`DfContentInfoDb` in `df-downloader-service/src/db/`. When the on-disk DB
  format needs to change, add a step to the existing `patchRoutine` version chain,
  don't write a one-off migration script. This is the exact mechanism to use for the
  Phase 1 new-site DB migration (see `docs/DF_SITE_MIGRATION.md`).
- **Two unrelated "auth" concepts coexist** — don't conflate them: the app's own local
  account system (JWT/cookie, `rest/auth/`) vs. the Digital Foundry site session (the
  `autologin`-cookie flow, `DfSettingsForm` in `components/settings/df-settings.component.tsx`
  + `DfUserManager`/`df-content-manager.ts`). A bug report or task about "login" —
  clarify which one.
- Tasks/downloads run through a generic FSM-based pipeline system
  (`fsm/`, `task-manager/`, `download/`) — reuse it for new async multi-step work
  rather than building bespoke state tracking.
- The REST response envelope is always `{success, data}` / `{success:false, error}`,
  unwrapped client-side via `df-downloader-common`'s `parseResponseBody()` against a
  zod schema. New endpoints should follow this pattern (`sendResponse`/`sendError` in
  `rest/utils/utils.ts`).

## Things that are currently known-broken or intentionally disabled

- `DigitalFoundryContentManager.start_reinstate_when_new_site()` — dead code, the
  pre-relaunch version of `start()`, kept intentionally as a reference for what the
  polling loop used to do; not currently called.
- **YouTube subtitle extraction is broken** (`youtube-subs.ts`'s `fetchYtSubs`,
  wired as the `"youtube"` `SubtitlesService`) — reportedly since a YouTube-side change,
  not yet diagnosed. See `docs/ROADMAP.md`'s Phase 3, item 3.
- **DF's downloaded videos aren't a frame-accurate match for the YouTube source** for
  content with a sponsorship intro on YouTube that the download has stripped out - this
  means YouTube-sourced chapters/duration (and to a lesser extent description) can be
  offset/wrong relative to the actual file. There's already a working offset-correction
  pattern for *subtitles* (`media-utils/subtitles/youtube.ts`'s `getSubs()`) that's very
  likely silently defeated by this session's `mediaInfo.duration` backfill work (both
  sides of its offset comparison probably now trace back to the same YouTube number
  instead of one being the real local file's measured duration). See `docs/ROADMAP.md`'s
  Phase 3 "Core problem" writeup before touching chapters, description, or duration
  backfilling again.

Don't assume TypeScript errors you might see referenced in old notes/logs are still
current — a `df-content-manager.ts`/`tasks.ts` type mismatch around
`setContentInfosWithAvailability` was already fixed in a later commit (see git log:
`085c3b8`, `2b75b2f`, `4efbbad`, `739a15d`). Re-run `check-build` yourself rather than
trusting stale error output.

## Auth research notes (do not re-derive, already confirmed)

The new site's `autologin` cookie (a persistent remember-me token,
`<selector>~<validator>` shape) alone is sufficient to authenticate scraping/download
requests, doesn't rotate on reuse, and is the direct replacement for the old
`sessionid` cookie. Full details, including the listing-page HTML structure for
`/videos`, are in `docs/DF_SITE_MIGRATION.md` — read that before writing any new
scraper code so you're not re-fetching/re-discovering the same things.
