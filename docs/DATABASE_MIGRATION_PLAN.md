# JSON-file DB → SQLite — Implementation Plan

Status: **planned, not started — and not fully decided.** Expands on
`docs/INFRASTRUCTURE_PROPOSALS.md`'s investigation, refined by discussion with the
project owner (2026-08-27) confirming the indexed-JSON-blob approach is genuinely
viable, not just a real-DB-in-name-only compromise. **The project owner has not yet
committed to doing this at all** - option 1 below (fix the JSON approach's real
problems without a DB engine change) may be sufficient on its own. Read the "Open
decision" section before starting any implementation.

## The two real problems (recap, see INFRASTRUCTURE_PROPOSALS.md for full detail)

1. `FileDb.updateDb()` (`df-downloader-service/src/db/file-db.ts:66-74`) rewrites the
   **entire** file on every single write, regardless of change size - O(total DB size)
   per write, not O(change size). Current real dev DB: content-info ~4.97MB,
   content-status ~734KB.
2. Writes aren't atomic (`fs.promises.writeFile` can leave a truncated/invalid file on
   a mid-write crash).

Not a live performance emergency at current scale (reads are fine, and the DF archive
is a known, bounded ~3,000 videos) - these are real but not urgent, which is exactly why
this needs the project owner's explicit call on how far to go, not a default "obviously
do the big rewrite" assumption.

## Option 1: fix the JSON approach directly (no new dependency)

Do this regardless of the SQLite decision below - cheap, safe, addresses both real
problems immediately:
- Compact `JSON.stringify(data)` instead of pretty-printed (`null, 2`) - nothing reads
  these files by hand, the indentation is pure size/parse-time waste.
- Atomic writes: write to a temp file, then `rename()` over the target, instead of
  writing the target path directly.
- Debounce/coalesce `scheduleUpdateDb()` calls within a short window (e.g. during a
  scan) into one write of the latest state - reduces write *count*, complementary to
  (not a replacement for) the above.

This alone may be "good enough" per the project's own stated preference for pragmatic
fixes over architectural investment (`CLAUDE.md`: "not a general-purpose product...
prefer pragmatic fixes over enterprise-grade abstraction"). **Confirm with the project
owner whether option 1 alone is the actual goal before starting option 2's bigger
work.**

## Option 2: SQLite as an indexed JSON-blob store

Confirmed viable in discussion, not just "a real DB in name only" - the key mechanism
is SQLite **generated columns** computed from `json_extract()` on a JSON blob column,
which *can* be indexed normally:

```sql
CREATE TABLE content (
  key TEXT PRIMARY KEY,
  data TEXT,  -- the full DfContentInfo JSON blob, unchanged shape
  published_date TEXT GENERATED ALWAYS AS (json_extract(data, '$.publishedDate')) VIRTUAL,
  legacy INTEGER GENERATED ALWAYS AS (json_extract(data, '$.legacy')) VIRTUAL,
  unpatchable INTEGER GENERATED ALWAYS AS (json_extract(data, '$.unpatchable')) VIRTUAL
);
CREATE INDEX idx_content_published ON content(published_date);
CREATE INDEX idx_content_legacy ON content(legacy);
```

`data` stays the single source of truth, in exactly the same shape as the existing
`DfContentInfo` zod schema - no separate normalized-column mapping layer for every
field, and the generated columns stay in sync automatically on every write (no
dual-write bookkeeping, no risk of an index drifting from the blob).

**The one genuine exception: `tags`.** A JSON array doesn't index the same way -
`json_extract` on an array path returns the array as text, not a per-element indexable
thing. Real tag filtering (including the existing AND/OR mode - see
`ContentInfoFilter`/`TagFilterUtils`) needs an actual small join table:
```sql
CREATE TABLE content_tags (content_key TEXT, tag TEXT);
CREATE INDEX idx_content_tags_tag ON content_tags(tag);
```
This is a small, targeted bit of real normalization for just this one field - not a
sign the whole approach is compromised.

**Bonus, not required for v1**: SQLite's FTS5 extension would give real indexed
full-text search over title/description for the `/api/content/query`'s `search` param
(currently, check whether this is a JS substring scan - confirm before assuming).

### Concrete field mapping (confirmed against the real current query code)

`df-downloader-service/src/rest/api/content.ts`'s `/query` endpoint filters/sorts by:
`availability` (currently on `content-status-db.json`, a **separate file** from
content-info today - decide whether to merge content-info + content-status into one
table given how tightly they're co-queried, or keep two tables and join), `tags`
(needs the join table above), `search` (free text), plus implicit newest-first sort by
`publishedDate`. `/api/content/search` (`DfContentEntrySearchUtils.search()`) currently
does a full in-memory scan over `getAllContentEntries()` - this is the code path that
would actually change to real SQL queries.

### Packaging: check `node:sqlite` stability before choosing a package

The project has been bitten by native-module packaging pain before (`bcrypt`,
`utimes`, `ffmpeg-static` - see `strip-ffprobe-binaries.cjs` and the npm workspace
`overrides` entries in root `package.json`). Node's built-in `node:sqlite` module has
**no native-module dependency at all** (ships with Node itself) but was experimental as
of Node 22 - the project's current Docker base is Node 24 (`Dockerfile`) - **check
whether it's stabilized in that version before deciding** between it and a
native-binding package like `better-sqlite3`. This materially affects how much
packaging risk this migration carries, so resolve it before writing any code.

### Migration mechanics

This is a real departure from the current mechanism, not a drop-in swap:
- Today: `FileDb`'s versioned `patchRoutine` chain, mutating one big in-memory JS
  object, validated against a zod schema as a unit, with automatic pre-patch backup and
  rollback-on-failure (`db/file-db.ts`) - a proven, already-exercised-multiple-times
  pattern (see `docs/DF_SITE_MIGRATION.md`'s migration history).
- SQLite: schema migrations (`CREATE TABLE`/`ALTER TABLE`/`CREATE INDEX` scripts,
  tracked by a version number in the DB itself, e.g. `PRAGMA user_version`) plus a
  **one-time data migration** reading the existing `content-info-db.json`/
  `content-status-db.json`/`user-db.json` files and inserting their contents as rows.
  Existing installs upgrading need this one-time import to run automatically on
  startup, the same "don't force a full re-scan" backward-compatibility bar the
  original new-site migration held itself to (see `docs/DF_SITE_MIGRATION.md`).
- The zod-schema-as-contract pattern (`df-downloader-common` is the single source of
  truth for the domain model - see `CLAUDE.md`'s "Conventions worth knowing") stays
  intact for the blob column's shape; only the *storage/query* layer changes.

## Open decision - resolve before starting real implementation

1. Is option 1 alone sufficient, or does the project owner want option 2's bigger
   change? Don't assume - ask.
2. If option 2: confirm `node:sqlite`'s stability on Node 24 first (see above).
3. If option 2: decide whether content-info and content-status merge into one table or
   stay separate-but-joined - affects the schema design meaningfully.

## Suggested milestones (option 2, if greenlit)

1. Resolve the open decisions above.
2. Schema design + a one-time migration script (existing JSON files → SQLite), tested
   against a real, populated dev DB copy - not a synthetic/empty one (the original
   new-site DB migration's small-test-DB mistake is documented in `docs/DF_SITE_MIGRATION.md`'s
   history - don't repeat it).
3. Swap the DB access layer (`DfDownloaderOperationalDb` interface and its
   implementations) behind the existing interface where possible, so callers
   (`DigitalFoundryContentManager` etc.) need minimal changes.
4. Convert `/api/content/search`'s in-memory scan to real SQL queries using the new
   indexed columns/join table.
5. Verify write-amplification and atomicity are actually fixed (a single-item update
   should now be a single-row `UPDATE`, not a whole-file rewrite) - this is the actual
   point of the exercise, confirm it rather than assuming the migration alone achieves
   it.
