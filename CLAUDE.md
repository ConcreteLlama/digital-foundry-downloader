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

## Current state (as of 2026-08-14) — read this first

Digital Foundry left their old host and relaunched independently at
`digitalfoundry.net` with an entirely different CMS, HTML structure, and auth
mechanism. This broke the tool's scraper. As a stopgap (~Sept 2025), automated DF-site
scanning was disabled and a manual "paste HTML from the Patreon posts page" import path
was added instead (see `docs/ARCHITECTURE.md`'s "Patreon-import stopgap" section). The
new site relaunched its video archive as of this writing, making real scraping viable
again — see `docs/DF_SITE_MIGRATION.md` for what's already been reverse-engineered
(auth cookie, listing page structure) toward un-disabling proper site support.

We're currently in **Phase 1** of `docs/ROADMAP.md` (update the tool for the new site).
Phase 0 (understand & document) is done. Phase 1 work is well underway on branch
`feature/new-df-site` (off `experimental`, uncommitted): `df-fetcher.ts` rewritten
against the new site (`autologin` cookie auth + the `/api/1.0/listing` JSON endpoint),
`df-content-manager.ts` updated to match, `DfContentInfo.key`/`.name` split so identity
no longer depends on a DF-hosted URL, and the DB migration for existing users'
local data implemented and verified against the real dev DB — see
`docs/DF_SITE_MIGRATION.md`'s "Implementation status" section for the full rundown.
Remaining before the auto-poll loop can safely come back on: a real end-to-end download
test, and a not-yet-designed safeguard against mass auto-downloads the first time
`checkForNewContents()` ever runs against the new site for a given install — not an
idle-time thing, every install needs this on upgrade regardless of how recently it last
ran (see the same doc). Don't start
Phase 2 (optional yalc → npm workspaces migration — a Next.js rewrite was considered
and rejected, see `docs/ROADMAP.md`) without explicit sign-off.

## Repo layout

Three-package monorepo, linked via **yalc** (not npm workspaces):
- `df-downloader-common/` — shared zod schemas/types/utils, source of truth for the
  domain model.
- `df-downloader-service/` — Express backend (scraping, downloads, task queue, REST
  API).
- `df-downloader-ui/` — React admin SPA.

Full detail in `docs/ARCHITECTURE.md`.

## Build / dev commands

From repo root (`package.json` orchestrates the sub-packages):
```
npm run install-all-deps   # first-time setup, installs deps in all 3 packages
npm run build              # full build: common -> ui -> service (bundles UI into service's public/)
npm run dev:service        # nodemon-driven service dev server (needs df-downloader-service/dev.env, copy from dev.env.sample)
npm run dev:ui              # vite dev server for the UI
```
Within `df-downloader-common` or `df-downloader-service`, `npm run check-build` runs
`tsc --noEmit`. **`node_modules` are not pre-installed in this checkout** — run
`npm run install-all-deps` (or `npm i` per-package) before trying to build/typecheck.

If you edit `df-downloader-common`, you must rebuild it and re-run
`npm run add-common` in whichever consumer package you're testing (`full-build` scripts
do this automatically) — yalc doesn't hot-reload across packages the way a normal
monorepo workspace would.

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
  account system (JWT/cookie, `rest/auth/`) vs. the Digital Foundry site session
  (currently the disabled `sessionid`-paste flow, moving to `autologin`-cookie per the
  migration doc). A bug report or task about "login" — clarify which one.
- Tasks/downloads run through a generic FSM-based pipeline system
  (`fsm/`, `task-manager/`, `download/`) — reuse it for new async multi-step work
  rather than building bespoke state tracking.
- The REST response envelope is always `{success, data}` / `{success:false, error}`,
  unwrapped client-side via `df-downloader-common`'s `parseResponseBody()` against a
  zod schema. New endpoints should follow this pattern (`sendResponse`/`sendError` in
  `rest/utils/utils.ts`).

## Things that are currently known-broken or intentionally disabled

- `df-fetcher.ts` has been rewritten for the new site (see above) but
  `DigitalFoundryContentManager.start()` still doesn't call the DF-site polling loop —
  it needs re-enabling once the new fetcher's had more real-world exercise (currently
  only verified via a one-off manual script, not the full auto-download path).
- `DfSessionCheckDialog` (UI) — hard-disabled (`const open = false`) pending the new
  auth flow being wired all the way through.
- `DigitalFoundryContentManager.start_reinstate_when_new_site()` — dead code, the
  pre-relaunch version of `start()`, kept intentionally as a reference for what the
  polling loop used to do; not currently called.

Don't assume TypeScript errors you might see referenced in old notes/logs are still
current — several parser bugs in `patreon-html-parser.ts` (undefined `$`, missing
cheerio type exports) and a `df-content-manager.ts`/`tasks.ts` type mismatch around
`setContentInfosWithAvailability` were already fixed in later commits (see git log:
`085c3b8`, `2b75b2f`, `4efbbad`, `739a15d`). Re-run `check-build` yourself rather than
trusting stale error output.

## Auth research notes (do not re-derive, already confirmed)

The new site's `autologin` cookie (a persistent remember-me token,
`<selector>~<validator>` shape) alone is sufficient to authenticate scraping/download
requests, doesn't rotate on reuse, and is the direct replacement for the old
`sessionid` cookie. Full details, including the listing-page HTML structure for
`/videos`, are in `docs/DF_SITE_MIGRATION.md` — read that before writing any new
scraper code so you're not re-fetching/re-discovering the same things.
