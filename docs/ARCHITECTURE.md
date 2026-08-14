# Architecture

DF Downloader is an npm-workspaces-style monorepo (not actual npm workspaces — each
package has its own `node_modules` and is linked via **yalc**, not `file:` or workspace
protocol) with three packages:

```
df-downloader-common/   shared zod schemas, types, and framework-agnostic utils
df-downloader-service/  Node/Express backend — scraping, downloading, task queue, REST API
df-downloader-ui/       React admin SPA — content browser, download manager, settings
```

Root `package.json` scripts orchestrate all three (`npm run build`, `npm run dev:service`,
`npm run dev:ui`, etc). See root `README.md` for setup instructions.

`df-downloader-common` is consumed by both other packages via **yalc** (a local-package
linker — `.yalc/df-downloader-common` + `yalc.lock` in each consumer), not a normal npm
dependency. After changing `common`, you must rebuild it and re-run `npm run add-common`
(or `yalc push` from `common`) in the consuming package, or changes won't be picked up.
This trips people up constantly — if a change to a shared type doesn't seem to take
effect, this is the first thing to check.

## df-downloader-common

The single source of truth for the domain model. Both the UI and service import from it,
so a schema change here immediately shows up as type errors everywhere it's used —
which is the main safety net when refactoring the shared model.

- **Models** (`src/models`) — zod schemas + inferred types + `*Utils` helper namespaces.
  Key ones: `DfContentInfo` (a piece of content: title, description, tags, media
  variants, `source: "digitalfoundry" | "manual" | "patreon"`), `MediaInfo` (one
  downloadable variant: format, encoding, resolution/framerate/bitrate, size, URL),
  `DfContentEntry` (the DB-persisted wrapper: content + availability + downloads),
  `DfContentDownloadInfo` (a completed download record), task/pipeline models
  (`TaskInfo`, `TaskPipelineInfo`, discriminated by `taskType`), the app's own local-user
  auth models (`User`, `UserRole`, distinct from the DF site's `DfUserInfo`), and the
  generic REST envelope (`parseResponseBody`, `makeSuccessResponse`/`makeErrorResponse`).
- **Config** (`src/config`) — `DfDownloaderConfig` assembles ~12 sub-schemas by key
  (`digitalFoundry`, `contentDetection`, `automaticDownloads`, `contentManagement`,
  `downloads`, `mediaFormats`, `authentication`, `restApi`, `metadata`, `subtitles`,
  `notifications`, `logging`, `dev`). This is the config file schema *and* drives the
  UI's auto-generated settings forms (via `zod-fields` components) — one place to
  add/change a config option and it flows through everywhere.
- **Utils** (`src/utils`) — filename templating (Handlebars-based, `makeFilenameWithTemplate`),
  media-format inference (`inferMediaInfo`, `MediaFormatMatchers`,
  `createMediaInfoFromFormatString`), byte/duration formatting, filter/search primitives,
  logger.

See [MODELS.md](MODELS.md) for a fuller inventory if needed — most of it is
self-documenting once you know the shape above.

## df-downloader-service

Express backend. Entry point `src/index.ts`: loads config → opens the file-based DB →
constructs `DigitalFoundryContentManager` → registers REST routes → starts the content
manager's polling loop.

### Content pipeline

`DigitalFoundryContentManager` (`src/df-content-manager.ts`) is the top-level
orchestrator:
- On startup, scans the DF archive (`scanWholeArchive`) and reconciles against the DB.
- Periodically calls `checkForNewContents()` to look for new videos and optionally kick
  off auto-downloads (respecting format priority + exclusion filters from config).
- Owns a `DfUserManager` (tracks the DF site login/subscriber-tier state) and a
  `DfTaskManager` (owns the actual download/subtitle/maintenance task pipelines).

`src/df-fetcher.ts` is the **DF-site scraping layer** — the part that will need a near-total
rewrite for the relaunched site (see [DF_SITE_MIGRATION.md](DF_SITE_MIGRATION.md)). It
uses `htmlparser2` + `css-select` to parse the old site's archive/article pages and
extract `DfContentInfoReference`/`DfContentInfo`/`MediaInfo`. Auth is a single `cookie:
sessionid=<value>` header built by `makeAuthHeaders()`.

`src/utils/patreon-html-parser.ts` is a **separate, newer** scraper (uses `cheerio`
instead of `htmlparser2`) that parses HTML the user manually pastes from the DF Patreon
posts page — this is the interim "DF site is down" workaround (see below), not part of
the normal `df-fetcher.ts` flow.

### Task/pipeline system

A generic FSM-based task framework (`src/fsm/`, `src/task-manager/`) underlies
everything that runs asynchronously with progress/retry/pause/cancel semantics:
- `Task` — single unit of work with an FSM (idle → running → success/failed, plus
  pause/retry states).
- `TaskManager` — runs a bounded-concurrency queue of `Task`s.
- `TaskPipeline` (`task-manager/task-pipeline/`) — chains multiple task steps together
  (e.g. download → fetch subtitles → fetch chapters → inject metadata → move file) into
  one `TaskPipelineExecution`, tracked as a unit in the UI's task list.
- `DfTaskManager` (`src/df-task-manager.ts`) wires up the concrete pipelines
  (`download-task-pipeline.ts`, `subtitles-task-pipeline.ts`,
  `update-download-metadata-task-pipeline.ts`) and exposes `downloadContent()`,
  `downloadManualContent()`, pause/resume/cancel control, and the `TaskInfo`/
  `TaskPipelineInfo` serialization consumed by the REST API and polled by the UI.
- The actual byte-level download engine (`src/download/`) is its own nested FSM
  (`download-connection` for one HTTP connection, `downloader` for the overall
  multi-connection/retry/resume logic) — supports resuming partial downloads and
  multiple simultaneous connections per download.

### Persistence

`DfDownloaderOperationalDb` (`src/db/df-operational-db.ts`) is an abstract interface;
`DfFileOperationalDb` is the only implementation — flat JSON files under
`df-downloader-service/db/` (`content-info-db.json`, `content-status-db.json`,
`user-db.json`). No real database. Config is a YAML file
(`df-downloader-service/config/config.yaml`), managed by `ConfigService` /
`FileConfigService`, with change events (`configUpdated:<section>`) other parts of the
app subscribe to.

### REST API

`src/rest/routes.ts` mounts `/api` (see `src/rest/api/*.ts` — one router file per
resource: `content`, `tasks`, `config`, `auth`, `user`, `df-user-info`, `subtitles`,
`preview`, `service-info`) plus a static file server for the built UI
(`src/rest/web.ts`). Auth for the app's own local accounts is JWT-in-cookie
(`src/rest/auth/jwt.ts`, `src/rest/middleware/authentication.ts`) — this is entirely
separate from the DF-site session cookie and is unaffected by the DF relaunch.

### The Patreon-import stopgap (current state, added ~Sept 2025)

When the old digitalfoundry.net was decommissioned and the archive scraper stopped
working, a manual workaround was added rather than trying to keep the scraper alive
against a moving target:
- `components/df-content/html-import-tab` (UI) + `POST /api/tasks/import-html` →
  `parsePatreonHtml()` (`src/utils/patreon-html-parser.ts`) — user manually opens the DF
  Patreon posts page, copies the outer HTML, pastes it in; the parser extracts
  post title/date/tags/YouTube ID/download links via `cheerio` + a lot of defensive
  regex-based text parsing (dates like "3 days ago", formats embedded as
  `"FORMAT: <a href=...>"`).
- `components/df-content/manual-download-tab` + `POST /api/tasks/manual` — fully manual
  single-URL/title/tags entry, no parsing at all.
- The automatic DF-site polling loop is effectively disabled: `DigitalFoundryContentManager.start()`
  no longer calls the DF-site check loop (see the `start()` vs
  `start_reinstate_when_new_site()` methods in `df-content-manager.ts:69-142` — the
  latter is the pre-relaunch code, kept but unused, explicitly named as "reinstate when
  there's a new site").
- `DfSessionCheckDialog` (UI) is hard-disabled (`const open = false`) with a comment
  noting the DF site is down.

This is the code that the relaunch work is expected to replace/re-enable — see
[DF_SITE_MIGRATION.md](DF_SITE_MIGRATION.md).

## df-downloader-ui

React 18 + TypeScript + Vite + MUI 5 + Redux Toolkit (listener-middleware pattern, no
RTK Query, no sagas) + react-hook-form. Consumes `df-downloader-common` via yalc, same
as the service.

- `App.tsx` — branches between `AppNotReadyPage` (backend unreachable) → `AuthPage` (no
  local app login) → `MainApp` (main router: content browser, downloads, settings, tools,
  system/changelog).
- API calls live in `store/<slice>/<slice>.listener.ts`, using a shared
  `addFetchListener()` helper that fetches, validates the response against a
  `df-downloader-common` zod schema via `parseResponseBody()`, and dispatches
  success/failure. A 401 anywhere triggers a global `userLoggedOut()`.
- Settings pages are almost entirely generic: one zod-schema-driven form component
  (`DfSettingsSectionForm`) reused per config section, so most config additions in
  `df-downloader-common` just need a form field added, not a new page.
- Two unrelated "auth" concerts live side by side — don't conflate them:
  1. **App-local accounts** (this tool's own login, JWT/cookie-based) — unaffected by
     the DF relaunch.
  2. **DF-site session** — `DfSettingsForm` (`components/settings/df-settings.component.tsx`)
     is the manual `sessionid`-cookie-paste UI that needs to change to whatever the new
     auth mechanism becomes (see migration doc).

## Data flow summary (old/current model)

```
DF site archive pages  →  df-fetcher.ts (htmlparser2/css-select)  →  DfContentInfo[]
                                                                          │
                                                                          ▼
                                                    DigitalFoundryContentManager
                                                     (dedupe against DB, filter by
                                                      format priority + exclusions)
                                                                          │
                                                                          ▼
                                                            DfTaskManager.downloadContent()
                                                                          │
                                                                          ▼
                                          download-task-pipeline (download → subtitles →
                                                chapters → inject metadata → move)
                                                                          │
                                                                          ▼
                                                        DfFileOperationalDb (JSON files)
                                                                          │
                                                                          ▼
                                                     REST API  →  polled by React UI
```

The Patreon-import path replaces only the top box (content discovery) with a manual
paste; everything below `DigitalFoundryContentManager` is unchanged and reusable.
