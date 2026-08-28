# Architecture

DF Downloader is an **npm workspaces** monorepo (yalc was used before 2026-08-14; see
git history if you need the old linking model) with three packages, declared in the
root `package.json`'s `workspaces` field:

```
df-downloader-common/   shared zod schemas, types, and framework-agnostic utils
df-downloader-service/  Node/Express backend — scraping, downloading, task queue, REST API
df-downloader-ui/       React admin SPA — content browser, download manager, settings
```

A single `npm install` at the repo root installs and hoists dependencies for all three
into one root `node_modules`. Root `package.json` scripts orchestrate builds/dev servers
across all three (`npm run build`, `npm run dev:service`, `npm run dev:ui`, etc). See
root `README.md` for setup instructions.

`df-downloader-common` is consumed by both other packages as a normal npm dependency
(`"df-downloader-common": "*"`) resolved to a real symlink
(`node_modules/df-downloader-common -> ../df-downloader-common`) by npm's workspace
linking — no publish/link step, no `.yalc` copies to go stale. After changing `common`,
just rebuild it (`npm run build -w df-downloader-common`, or run its `npm run watch` in
the background) — consumers pick up the new `dist/` output immediately since they're
resolving through the symlink to the same directory. `df-downloader-common`'s
`package.json` declares an `exports` map (`"./*"` and `"./*.js"` wildcards pointing into
`dist/`) so consumers can still `import` its internal `config/`, `models/`, `utils/`
files by subpath the same way they could when yalc's published copy made `dist/` the
effective package root. `df-downloader-service`'s `tsconfig.json` uses
`"moduleResolution": "bundler"` (matching the UI) so `tsc` actually honors that exports
map — be aware this also means any *new* deep import into a third-party `node_modules`
package must be something that package's own `exports` field actually allows, even if
the target file exists on disk (bit us once with `@deepgram/sdk`, see
`df-downloader-service/src/media-utils/subtitles/deepgram.ts`).

## df-downloader-common

The single source of truth for the domain model. Both the UI and service import from it,
so a schema change here immediately shows up as type errors everywhere it's used —
which is the main safety net when refactoring the shared model.

- **Models** (`src/models`) — zod schemas + inferred types + `*Utils` helper namespaces.
  Key ones: `DfContentInfo` (a piece of content: title, description, tags, media
  variants, `legacy`/`unpatchable` flags for entries not yet confirmed against the
  current site, `source: "digitalfoundry" | "manual" | "patreon"` — `"patreon"` is
  vestigial, kept only so old entries created during the since-removed Patreon-import
  stopgap still parse; nothing writes it anymore), `MediaInfo` (one
  downloadable variant: format, encoding, resolution/framerate/bitrate, size, URL,
  duration — duration is only ever backfilled from YouTube, never from DF's own
  listing),
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
- On startup (and whenever a config update transitions the account from signed-out to
  signed-in), scans the DF archive (`scanWholeArchive`) and reconciles against the DB —
  a resumable, checkpointed full walk when there are `legacy`/unconfirmed entries to
  resolve, otherwise a cheaper tail-only resume.
- A recurring poll (`startContentPollLoop`, gated on sign-in) calls
  `checkForNewContents()` to look for new/updated videos and optionally kick off
  auto-downloads (respecting format priority + exclusion filters from config — including
  a description filter, which lazily fetches YouTube metadata for a candidate first
  since DF's own listing never has a description).
- Owns a `DfUserManager` (tracks the DF site login/subscriber-tier state) and a
  `DfTaskManager` (owns the actual download/subtitle/maintenance task pipelines).
- Every scan/refresh/download-triggered fetch is hard-gated on `DfUserManager.isUserSignedIn()`
  — the tool never scans or refreshes against the site while signed out.

`src/df-fetcher.ts` is the **DF-site scraping layer**, rewritten for the relaunched site
(see [DF_SITE_MIGRATION.md](DF_SITE_MIGRATION.md) for the reverse-engineering). It calls
the site's own `/api/1.0/listing` JSON endpoint (no HTML scraping, no per-video detail
fetch — the listing response has everything) and extracts `DfContentInfo`/`MediaInfo`
from each item. Auth is a single `cookie: autologin=<value>` header built by
`makeAuthHeaders()`. Every request goes through `df-request-queue.ts`'s `dfFetch()` —
concurrency 1, randomized spacing, transparent 429/503 backoff — rather than calling
`fetch()` directly, to avoid hammering DF's infrastructure; `dfFetch()` also supports a
`priority` hint (interactive actions jump queued bulk work) and a `bypassQueue` escape
hatch (a genuine one-off request, e.g. the manual download button specifically).

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
separate from the DF-site session cookie and is unaffected by the DF relaunch. The JWT
signing secret is persisted per-installation in `config/jwt-secret.yaml`
(`src/rest/auth/signing-secret.ts`), generated on first run, overridable with the
`JWT_SIGNING_SECRET` env var — deliberately *not* in `config.yaml`, since `GET
/api/config` returns that whole object to the UI. Deleting the file (or changing the
env var) rotates the secret and signs everyone out.

## df-downloader-ui

React 18 + TypeScript + Vite + MUI 5 + Redux Toolkit (listener-middleware pattern, no
RTK Query, no sagas) + react-hook-form. Consumes `df-downloader-common` via the npm
workspace link, same as the service.

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
- Two unrelated "auth" concepts live side by side — don't conflate them:
  1. **App-local accounts** (this tool's own login, JWT/cookie-based) — unaffected by
     the DF relaunch.
  2. **DF-site session** — `DfSettingsForm` (`components/settings/df-settings.component.tsx`)
     is the `autologin`-cookie-paste UI (a "Test Session ID" button verifies it before
     saving); `DfSessionCheckDialog` blocks the main UI with a prompt to configure one
     until the backend confirms a valid, subscribed session.
- `QueueStatusIndicator` (`components/general/`) is a small nav-bar badge polling a
  lightweight status endpoint — shows DF request-queue depth/backoff and scan-in-progress
  state, since the queue's own protections (see `df-request-queue.ts` above) mean
  actions can visibly pause with no on-screen explanation otherwise.

## Data flow summary

```
DF site listing API  →  df-fetcher.ts (/api/1.0/listing)  →  DfContentInfo[]
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
                                            YouTube meta (chapters/description/duration,
                                            embedded + backfilled to DB) → inject
                                            metadata → move)
                                                                          │
                                                                          ▼
                                                        DfFileOperationalDb (JSON files)
                                                                          │
                                                                          ▼
                                                     REST API  →  polled by React UI
```

See [DF_SITE_MIGRATION.md](DF_SITE_MIGRATION.md) for the full reverse-engineering of the
current site's auth/listing/download mechanics.
