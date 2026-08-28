# Infrastructure Proposals

Investigation write-ups for architectural questions raised by the project owner that
aren't yet scheduled work — unlike `docs/ROADMAP.md`, nothing here is greenlit. Each
section ends with a recommendation, but implementation should wait for explicit
sign-off, same as everything else in this repo.

## SSE/WebSockets for real-time updates (investigated 2026-08-27)

**Question raised**: are there parts of the app that would benefit from SSE/WebSockets?

**Finding**: yes, and the backend is most of the way there already - zero push-based
transport exists anywhere in the app today (`grep`-confirmed: no `EventSource`, no
`WebSocket`, no `socket.io` in `df-downloader-ui/src`), but the backend's core execution
model is already fully event-driven internally. `Task` (`task-manager/task/task.ts`)
emits `started`/`taskStateChanged`/`completed`; the download engine
(`download/downloader/downloader.ts`, `download/download-connection/download-connection.ts`)
emits `stateChanged` at both the per-connection and overall level, carrying byte-level
progress. None of that reaches the browser - it's all diffed away by polling.

Three candidates, ranked by how much it'd actually help:

1. **Task/pipeline progress** - `App.tsx`'s `MainApp` component polls
   `queryTasks.start()` **every 1 second, unconditionally, for the entire time the app
   is open**, regardless of whether any task is active. This is the strongest case:
   the backend already has real-time byte-level download progress as internal events
   (see above), so an SSE endpoint here wouldn't need any new backend event modeling -
   just a bridge that subscribes to the existing `EventEmitter`s and pipes them out over
   an SSE stream. Would also let the poll go away entirely when idle instead of running
   forever.
2. **Queue status indicator** (`components/general/queue-status-indicator.component.tsx`)
   - polls every 5s. Getting a stronger case for this over time: work in flight as of
   this writing (`feature/youtube-metadata-drift` branch) is expanding
   `QueueStatusResponse` to track individual request phases
   (`queued`/`waiting`/`in_flight`/`backing_off`) - a request's phase can change faster
   than 5s, so the UI can show stale info between polls.
3. **Content list refresh** (`routes/home/home.component.tsx`) - polls every 30s always,
   plus a 5s re-poll while a scan is in progress. Weaker case: this is a coarse
   "refetch everything" rather than incremental data, so a push signal here would mean
   "something changed, go refetch" rather than streaming fine-grained updates. Still a
   real win (30s is a long wait to see newly-detected content appear) but lower priority
   than the two above.

**Recommendation**: SSE over WebSockets, specifically. All three cases are
server→client only - nothing here needs the client to push real-time messages back -
so SSE's plain-GET-request model fits better than standing up a separate WebSocket
protocol/connection-management layer: it rides through the existing Express/REST/auth
middleware stack unchanged, and reconnection is handled natively by the browser's
`EventSource`. Start with task/pipeline progress (candidate 1) since the backend event
plumbing already exists for it.

## JSON "DB" files: alternatives (investigated 2026-08-27)

**Question raised**: the content/status/user data is stored as flat JSON files in lieu
of a real database - what are the options (a real DB, more efficient JSON handling, a
different format)?

### How it works today

`FileDb` (`df-downloader-service/src/db/file-db.ts`) is a generic versioned-JSON-file
store: on load, reads the whole file into memory as a plain JS object (or object
graph), and from then on **every read is served from memory** - the file is purely a
persistence/durability mechanism, not a query engine. Three files:
`content-info-db.json`, `content-status-db.json`, `user-db.json`. Current local dev DB
(a real, populated instance, not a toy example): **content-info ~4.97MB,
content-status ~734KB**.

Two concrete, measurable problems with the current approach:

1. **Every write rewrites the entire file.** `FileDb.updateDb()`
   (file-db.ts:66-74) does `JSON.stringify(this.data, null, 2)` - the *whole* in-memory
   object - on every single call, no matter whether one field on one entry changed or
   the whole DB was rebuilt. Writes are serialized through a `WorkerQueue` (concurrency
   1, so no corruption from concurrent writes), but each write still costs O(total DB
   size). This is a real, already-observed problem, not a theoretical one - session
   history (`db/backups/` investigation, see `docs/ROADMAP.md`'s git history around
   2026-08-15) found reconciliation writes during a scan were originally per-item (up
   to 5 full-file rewrites *each*), and batching them down to ~3 DB calls per page was
   a real, necessary fix for scan performance - the underlying whole-file-rewrite cost
   per call was never addressed, just called less often.
2. **Writes aren't atomic.** `fs.promises.writeFile` isn't crash-safe - if the process
   dies mid-write, the file can be left truncated/invalid, and `FileDb` has no recovery
   for that specific case (the backup-before-patch mechanism protects against a bad
   *migration*, not a bad *write*).

Also notable, not really a "problem" at current scale: reads/queries
(`/api/content/search`, `/api/content/query`) are in-memory linear scans over
`Object.values()`/arrays - `DfContentEntrySearchUtils.search()` is handed the full
entry list and filters it in JS. Fine today (a few thousand entries, low single-digit
MB, one user) - the whole DF archive is a known, bounded ~3,000 videos, so this doesn't
have unbounded-growth risk the way a multi-tenant product's data would.

### Options, cheapest/lowest-risk first

**1. Keep JSON, fix the obvious waste (no format/engine change):**
- Switch from pretty-printed (`null, 2`) to compact `JSON.stringify(data)`. Nothing
  reads these files by hand, so the indentation is pure size/parse-time waste -
  trivial, zero-risk change.
- Write atomically: write to a temp file then `rename()` over the target, instead of
  writing the target path directly - standard fix for the mid-write-crash corruption
  risk, independent of anything else here.
- Debounce/coalesce `scheduleUpdateDb()` calls - if several updates land in a short
  window (e.g. during a scan), collapse them into one write of the latest state
  instead of one write per call. Reduces write *count*; doesn't address per-write cost,
  so pairs with, doesn't replace, the ideas below.

**2. Restructure the flat-file approach itself** (bigger change, still no new
dependency): split the one monolithic `content-info-db.json` into one small file per
content entry (e.g. `db/content/<key>.json`), so a single-item update only rewrites
~1KB instead of ~5MB. Real tradeoff: startup now reads potentially thousands of small
files instead of one (slower cold start, more filesystem metadata overhead), and the
existing versioned `patchRoutine` migration chain - which currently mutates one big
in-memory object, validates it as a unit, and backs up/restores atomically on failure -
would need real rework to migrate many independent files consistently. Doesn't feel
like a clear win over option 3 for the added complexity.

**3. Adopt an embedded database engine** - still a single local file, no server
process to run or operate (important for a self-hosted personal tool): **SQLite** is
the practical choice here specifically. Two ways to use it, worth being deliberate
about:
   - *Fully relational* (normalized tables/columns for every field) - overkill for
     this project's scale and would fight the existing zod-schema-as-source-of-truth
     pattern (`df-downloader-common`) that both the UI and service already depend on.
   - *SQLite as an indexed JSON-blob store* (recommended if this path is taken): one
     row per content entry, `key` as the primary key/index, the rest of the
     `DfContentInfo` object stored as a JSON column (SQLite's `json_extract`/generated
     columns can index into it if a specific field ever needs fast filtering, e.g.
     `legacy`). This solves both real problems - a single-entry update is a single-row
     `UPDATE`, not a whole-file rewrite, and SQLite transactions are atomic by
     construction (no more hand-rolled backup-before-patch dance for routine writes,
     only for schema migrations) - while keeping almost all existing zod-parsing code
     unchanged, since the stored value is still just the same JSON shape.
   - **Packaging note worth checking before committing to this**: the project has been
     bitten by native-module packaging pain before (`bcrypt`, `utimes`,
     `ffmpeg-static` - see `strip-ffprobe-binaries.cjs` and the npm workspace
     `overrides` entries in root `package.json`). Node's built-in `node:sqlite` module
     (no native-module dependency at all, ships with Node itself) was experimental as
     of Node 22 - worth checking whether it's stabilized by Node 24 (the project's
     current Docker base image, see `Dockerfile`) before choosing between it and a
     native-binding package like `better-sqlite3`.
   - Migrations would move from the current JSON-shape `patchRoutine` chain to SQL
     schema migrations - a real, if fairly standard, rework of that mechanism, not a
     drop-in swap.
   - Considered and set aside: LevelDB/LMDB-style embedded key-value stores - similar
     zero-ops benefits and arguably an even more natural fit (this app is
     already fundamentally keyed by content `key`), but less familiar/battle-tested for
     a solo maintainer, and typically needs native bindings too, without SQLite's
     `node:sqlite` no-native-dependency option. `lowdb` and similar "JSON but with a
     nicer API" packages were also considered and dismissed - they don't actually
     change the underlying whole-file-JSON mechanics, so they wouldn't fix either real
     problem.

### Recommendation

This isn't a performance emergency at current scale (reads are fine, and the archive
size is bounded) - the two real, worth-fixing problems are write amplification and
write atomicity. Do option 1 regardless of anything else (cheap, safe, addresses
atomicity immediately and reduces the size/frequency pain right away). Whether to go
further to option 3 is a real design decision worth the project owner's explicit call,
not something to default into - option 1 alone may well be "good enough" given the
project's own stated preference for pragmatic fixes over architectural investment
(`CLAUDE.md`: "not a general-purpose product... prefer pragmatic fixes over
enterprise-grade abstraction"). If write frequency or DB size grows substantially
later, SQLite-as-JSON-store (option 3) is the natural next step, not option 2.
