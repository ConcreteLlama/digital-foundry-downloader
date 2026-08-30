# CLAUDE.md

Project-specific guidance for working on DF Downloader. Read `docs/ARCHITECTURE.md` and
`docs/DF_SITE_MIGRATION.md` before making non-trivial changes — this file is a summary
and pointer, not a replacement for them. `docs/ROADMAP.md` has the current phase plan
(gitignored - an internal working doc, not part of the public repo; it exists locally
for whoever's doing dev work here, so the references below assume you have it).

## What this project is

A personal tool (nodejs + React) that scrapes Digital Foundry's members-only video
archive and downloads videos the user has Patreon access to, injecting metadata,
generating subtitles, etc. Not a general-purpose product — built by and for one person
(the repo owner) who shares it publicly. Keep that in mind for scope: prefer pragmatic
fixes over enterprise-grade abstraction, and don't add config/features speculatively.

## Current state (as of 2026-08-27) — read this first

**Version 2.7.0.** Phase 3's items 1, 2 and 3 are done, plus local Whisper subtitle
generation and several unplanned fixes — see `docs/ROADMAP.md`'s Phase 3 for the full
write-up including the measurements and the two negative results worth not repeating
(Whisper's initial prompt doesn't fix jargon; YouTube captions can't be fetched at all).
Item 4 (Claude summaries) is now unblocked, since Whisper produces a transcript of every
download as a by-product.

**Branch state**: this work sits on `experimental` (and `feature/queue-contents-indicator`,
kept aligned), 10 commits ahead of where the remote was at `8864a9f`. Local `main` and
`develop` are still at `8864a9f`, so `experimental` is deliberately ahead of both until
this is promoted.

A warning for anyone working in a sandbox without repo credentials: **remote-tracking
refs in a checkout can be months out of date**, and `git fetch` fails outright without
SSH access rather than telling you the refs are stale. On 2026-08-27 the cached
`origin/experimental` pointed at a commit predating the entire new-site rewrite, which
led to a wrong conclusion about how large a push would be; the actual remote was fine and
matched `main`. Check `stat .git/refs/remotes/origin/<branch>` before trusting a
remote-tracking ref you haven't just fetched.

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

**Filename template path-separator fix (2026-08-28)**: a "/" (or "\\") inside an
interpolated value — most commonly `{{title}}`, e.g. "PS5/PS5 Pro/Series X/S Tech
Review" — used to survive into the rendered path and be honoured as a real separator,
silently creating spurious nested directories under `destinationDir`. Sanitization was
running, but only on the *rendered* output (`sanitizeFilePath`), which by design splits
on separators and sanitizes each part — so ":" was correctly replaced while "/" was not.
Values are now sanitized individually in `generateFilenameTemplateVarMap`
(`filename-template-utils.ts`) *before* substitution, which is the only point where a
user-authored separator in the template ("{{YYYY}}/{{title}}") is still distinguishable
from one that came out of the content. `tagsArray` is exempt (`rawValue: true`) since it
is only ever helper input for `ifTag`/`ifIn`, never rendered. The URL-derived
`mediaInfo.mediaFilename` is now sanitized on the workDir paths too
(`makeDfDownloadParams`, `DfTaskManager.downloadContent`) — it is percent-decoded, so it
could carry a separator as well.

  *Already-downloaded files sitting under the wrong nested paths need no bespoke
  migration*: the existing batch-move tooling now computes correct destinations, so
  Tools → Reorganize Files (`POST /api/content/preview-move` then `/move-files`) with the
  unchanged template will list and relocate them, and `POST /api/content/remove-empty-dirs`
  clears the leftover spurious directories.

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
To test a real built image rather than the dev server — running it locally against
throwaway config/db, separate from the live deployment — see
`docs/LOCAL_DOCKER_TESTING.md`. It covers the mounts, the port having to agree in
four places, and the fact that `config.yaml` holds a live DF credential that must
never be committed.

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

## Changelog process (read before finishing any user-facing body of work)

`df-downloader-service/changelog.yaml` is the source of truth; `CHANGELOG.md` at the
repo root is **auto-generated from it** by the pre-commit hook (`npm run
build-changelog`) — never hand-edit `CHANGELOG.md`, it'll just get overwritten.

**Mechanism**: the pre-commit hook's `validate-changelog` step fails the commit unless
`changelog.yaml`'s `versions[0].version` matches root `package.json`'s `version` field
exactly. **This is the only thing it checks** — it does not check that real content was
added, so bumping the version without writing a meaningful entry will technically pass
and produce a useless changelog. This gap has already caused real problems (see git
history around v2.6.0) — self-police this, the tooling won't catch it for you.

**When to add an entry**: batch related, user-meaningful work into one version bump +
one entry at a natural checkpoint (finishing a phase, promoting a branch) — not one
entry per commit, and not for WIP/investigation-only/internal-refactor-only work in
progress on a feature branch. Bump `version` in root `package.json` and add a matching
new entry at the *top* of `changelog.yaml`'s `versions` array in the same commit that
finishes the batch of work.

**Bumping the version is the project owner's call, not an implementing session's.**
If the top `changelog.yaml` entry's version is already unreleased (hasn't been
pushed/promoted yet), fold new user-facing work into *that* entry instead of opening a
new one — don't bump `version` in `package.json` just because a feature or session
finished. Only bump when the project owner explicitly asks for one. This has been a
recurring real annoyance (an implementing session bumping the version unprompted,
then having to be told to undo it) — when in doubt, add the changelog content and
leave the version alone.

**How to write it — this is the part that's easy to get wrong**: entries are genuinely
**user-facing prose**, not developer changelog/commit-message style. Read the `2.7.0`
and `2.6.0` entries in `changelog.yaml` as the reference for the expected voice before
writing a new one:
- A short prose `notes` field summarizing the whole release, written for someone
  deciding whether to upgrade, not a technical audience.
- Each bullet explains the *benefit or reason*, not just the mechanism - e.g. "Set how
  many CPU threads it may use, so transcribing doesn't slow down everything else on the
  machine" (why it matters), not "Added `whisperConfig.threads` option" (what changed).
- Nested sub-bullets under a headline bullet for a feature with multiple facets, rather
  than one flat list.
- Pick honestly from the real category enum (`features`, `bugfixes`, `enhancements`,
  `maintenance`, `security`, `misc`, `internal`) plus optional `known_issues` - most
  entries only use one or two of these, not all of them.

## Looking at task/download UI states without a real download

`df-downloader-ui/src/dev/` holds dev-only fixtures that inject fake pipeline state into
the store — downloading with live progress, post-processing part-way, failed-at-step-N
with a skipped step, cancelled, a long queue, empty. Reach them from **Settings → Dev →
Task fixtures**, or `__DF_FIXTURES__.play("failed")` in the console. They exist only in a
dev build (`import.meta.env.DEV`), never in a shipped bundle. Use these rather than
hand-building Redux state or firing real downloads at digitalfoundry.net to check a
layout — see `df-downloader-ui/src/dev/README.md`.

## Things that are currently known-broken or intentionally disabled

- `DigitalFoundryContentManager.start_reinstate_when_new_site()` — dead code, the
  pre-relaunch version of `start()`, kept intentionally as a reference for what the
  polling loop used to do; not currently called.
- **YouTube captions can no longer be fetched at all** — diagnosed 2026-08-27 and
  resolved by removal, not repair. The caption track is still advertised in the watch
  page and its `baseUrl` is still signed, but fetching it returns HTTP 200 with an empty
  body: for ASR and human-authored tracks, DF and non-DF videos, every format, with and
  without browser user-agent/cookies/referer/visitorData. InnerTube answers UNPLAYABLE
  for videos that play fine in a browser. That's YouTube's proof-of-origin (PO token)
  requirement, minted by their attestation JS, so no plain HTTP client can satisfy it.
  Working around it (yt-dlp-style client impersonation) was considered and rejected by
  the project owner - it's deliberate circumvention plus a permanent maintenance burden
  that fails *silently*. The `"youtube"` `SubtitlesService` is gone, with a config patch
  in `file-config.ts` stripping it from existing installs so they still boot. Local
  Whisper transcription replaced it. **Only captions are gated** - chapters, duration and
  descriptions still come from the watch page HTML and work fine.

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
