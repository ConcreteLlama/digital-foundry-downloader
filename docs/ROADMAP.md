# Roadmap

Set by the project owner, 2026-08-11. This is the intended order of work — don't jump
ahead to a later phase without checking in first.

## Phase 0 — Understand & document (this pass)

Read and document the existing monorepo (`ARCHITECTURE.md`), figure out what the new
site's auth and data look like (`DF_SITE_MIGRATION.md`), and get set up to start real
work. No functional code changes in this phase.

## Phase 1 — Update the tool for the new site (done)

Get the tool working against the relaunched `digitalfoundry.net` again. **Complete as of
2026-08-15** (all on branch `feature/new-df-site`, live on the `experimental` DockerHub
tag and the project owner's real Unraid deployment since). Status as of 2026-08-14,
updated below where later items closed out:

- [x] Replace the `sessionid`-cookie auth flow with the new `autologin`-cookie flow.
- [x] Rewrite the scraping layer (`df-fetcher.ts` and friends) against the new
  `/videos` / `/api/1.0/listing` structure.
- [x] Split content identity (`DfContentInfo.key`) from the cosmetic filename slug
  (`.name`), since the new site has no per-video URL to derive a stable slug from.
- [x] **DB/migration compatibility** — implemented and verified against the real dev
  DB: existing entries patched forward in place (rekeyed via cached `youtubeVideoId`
  where available), no forced full re-scan. See `DF_SITE_MIGRATION.md`'s
  "Implementation status" section.
- [x] Run a real download through the download engine end-to-end — **done 2026-08-15**,
  first real download success since the relaunch. The actual blocker turned out to be
  `DfTaskManager.downloadContent()` never sending the `autologin` cookie for DF-sourced
  downloads (not the earlier-suspected IP ban, which had already cleared by then with
  explicit sign-off to resume - see `DF_SITE_MIGRATION.md`).
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
- [x] Decide what becomes of the Patreon-import stopgap path once real scraping works
  again - retired (2026-08-15) now that real scraping and downloads are confirmed
  working end-to-end: the HTML-paste import UI/endpoint/parser were removed entirely
  (the still-useful "manual single-URL download" path was kept, just no longer
  tab-paired with it).
- [x] `DfSessionCheckDialog` re-enabled, and `start()` now hard-gates the initial
  archive scan on confirmed DF auth (never scans unauthenticated, auto-triggers a scan
  the moment valid auth is configured via the UI). See `DF_SITE_MIGRATION.md`.
- [x] The recurring auto-poll loop itself (periodic `checkForNewContents()`, as opposed
  to the one-time startup scan above) — **wired up 2026-08-15**
  (`DigitalFoundryContentManager.startContentPollLoop()`), gated on sign-in status, on
  `contentDetection.contentCheckInterval` (default raised to 30 minutes).
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

## Stabilization pass (2026-08-16 to 2026-08-18)

Not a planned phase — a run of fixes driven by live testing of Phase 1's work against
the project owner's real Unraid deployment, after pushing to the `experimental` DockerHub
tag. See `CLAUDE.md`'s "Current state" section for the summary and git history on
`feature/new-df-site` for individual commits. Highlights: several auth/session-UX bugs
(stale-state race on existing-install upgrades, a settings-save/background-poll race,
the "Test Session ID" button silently swallowing errors), request-queue priority and a
manual-download-only bypass so a deliberate click doesn't wait behind queued scan
traffic, blocking downloads for content not yet confirmed against the live site
(`legacy`), and lazily backfilling YouTube description/duration (never present in DF's
own listing) with a small nav-bar indicator for DF request-queue activity.

**2026-08-19**: `main`/`develop`/`experimental` fast-forwarded to be byte-identical
(all three now point at the same commit) — `feature/new-df-site` was a clean ancestor of
neither branch having diverged, so this was a plain fast-forward, not a merge. A real
`autologin` token that had been sitting in `docs/DF_SITE_MIGRATION.md`'s git history
since 2026-08-14 was also scrubbed from every branch via `git-filter-repo` + a
force-push (the token itself was independently invalidated by logging out/in on the DF
account first).

## Phase 3 — YouTube metadata drift, subtitle extraction, AI summaries (not started)

Raised by the project owner 2026-08-19, after live-testing the stabilization pass above.
**Deliberately handed off for a fresh session** (this doc plus the pointers below should
be enough context on their own — no need to read old conversation history). Work in
separate branches off `main` (`feature/youtube-metadata-drift`,
`feature/youtube-subtitle-extraction` — both created empty off `main` at commit
`8864a9f`, ready to check out). Item 4 explicitly depends on item 3's outcome — don't
start it first.

### Core problem underlying items 1 & 2

DF's downloaded video files are **not** a frame-accurate match for the YouTube upload -
some DF content starts with a sponsorship segment on YouTube that the downloaded file
has stripped out. Everything sourced from YouTube's page (`sync-yt-video-meta.ts`'s
`fetchYtVideoMeta` - chapters, description, duration) reflects the **un-stripped**
YouTube original, so it can be measurably longer than, and offset relative to, the
actual downloaded file.

**Important finding, not yet acted on**: `df-downloader-service/src/media-utils/subtitles/youtube.ts`
(`YoutubeSubtitleGenerator.getSubs()`, lines ~18-41) *already implements* this exact
offset-detection-and-correction pattern for subtitles - it computes
`offset = youtubeDurationS - videoLengthS` (via `MediaInfoUtils.getDurationSeconds(dfContentInfo.mediaInfo)`)
and shifts subtitle timestamps by it when YouTube's reported duration is longer. **This
logic is very likely silently neutered right now**: `videoLengthS` is meant to be the
*actual local file's* duration, but nothing in the download pipeline ever measures that
via `ffprobe` (the capability exists - `extractMediaMeta` in
`df-downloader-service/src/utils/media-metadata.ts`, currently only used for the
"refresh downloaded content's metadata" UI feature) and writes it to
`mediaInfo.duration`. Instead, `mediaInfo.duration` is now populated by *this session's*
`sync-yt-video-meta.ts` work - **sourced from YouTube's own page** (`ytInitialPlayerResponse.videoDetails.lengthSeconds`).
So `youtubeDurationS` and `videoLengthS` likely trace back to the same YouTube number,
making `offset` compute to ~0 even for content with a real stripped intro. Confirm this
live before assuming it's the actual bug, but if so: the fix is restoring a real
ffprobe-measured local duration (written once, right after download completes, into
`mediaInfo.duration` or a new field) as the authoritative "real length" side of that
comparison - the sync-yt-video-meta.ts backfill should then defer to that real
measurement rather than overwrite/coexist with it.

- [x] **1. Strip sponsorship mentions from YouTube descriptions.** **Done 2026-08-27** -
  implemented as *move to the end* rather than strip, at the project owner's preference:
  the sponsor still gets its mention, the description opens with what the video is about,
  and nothing is ever discarded, so a false positive costs a paragraph its position
  rather than its existence. Matching is restricted to credit-line phrasing in the
  opening paragraphs (see `utils/youtube/sponsorship.ts`). Validated against 13 real DF
  videos: moved for all 7 sponsored, untouched for all 6 unsponsored, zero mismatches
  against "does it have a `Sponsored by X` chapter" as ground truth. Original text: Heuristic text
  cleanup (regex/pattern-matching for "sponsored by", "thanks to X for sponsoring",
  common sponsor-blurb boilerplate) applied when backfilling `description` in
  `sync-yt-video-meta.ts`. Best-effort/conservative by nature - false negatives (missed
  sponsor text) are much safer than false positives (stripping real content).
- [x] **2. Fix chapter timestamp offset from the stripped intro sponsorship.**
  **Done 2026-08-27, verified against a real download.** Two things differed from what
  was anticipated below. First, the root cause was confirmed: the old fetcher scraped
  `.duration` from DF's own listing (across 24 pre-relaunch videos it matched YouTube
  exactly), the new site publishes none, so the field became YouTube-sourced and both
  sides of the comparison traced back to the same number. Downloaded files are now
  ffprobed on completion and that measurement stored, with `MediaInfo.durationSource`
  marking it `measured` so the YouTube backfill can't overwrite it. Second - and this
  changed the design - **the sponsor read is never at 0:00**; across a 13-video sample it
  always followed a short intro (0:29 to 2:26 in). So this is a *mid-video excision*, not
  a leading offset, and the leading-shift approach would have destroyed the intro's
  subtitles to fix the rest. Chapters now keep everything before the cut, drop what falls
  inside it, and shift only what follows. The segment is located from the "Sponsored by
  X" chapter and cross-checked against the measured gap; if they disagree by more than
  10s, or no such chapter exists, it logs and corrects nothing rather than guessing.
  Measured on Metro 2039: YouTube 741s, real file 659.839s, an 81.161s gap against an 82s
  sponsor chapter. Original text: The
  bigger issue - chapters (`fetchYtVideoMeta`'s `ytChaptersToChapters`, embedded into
  the downloaded file at download completion, see `fetch-chapters-task.ts`) are off by
  the sponsorship segment's length for affected content, since they're built from
  YouTube's un-stripped timeline. See "Core problem" above for the likely root cause and
  the existing (probably-broken) precedent to model the fix on. **The project owner has
  offered to trigger a real download of a known-affected video on request, to compare
  YouTube's chapter/duration data against the actual downloaded file** - take them up on
  this rather than guessing at the offset.
- [x] **3. Re-investigate YouTube subtitle extraction** - **diagnosed 2026-08-27, and
  resolved by removal rather than repair.** It cannot be fixed by adjusting the request:
  the track is still advertised and its `baseUrl` still signed, but fetching returns HTTP
  200 with an empty body - for ASR and human-authored tracks, DF and non-DF videos, every
  format, with and without browser user-agent, cookies, referer and visitorData; and
  InnerTube answers UNPLAYABLE for videos that play fine in a browser. That is YouTube's
  proof-of-origin (PO token) requirement, minted by their attestation JavaScript, so no
  plain HTTP client can produce one - hence a quiet empty 200 rather than an error.
  yt-dlp *was* evaluated and does still work (it impersonates client identities Google
  hasn't closed off - the visionOS one at time of testing), but the project owner
  rejected that route: it is deliberate circumvention of an access control, and it
  carries a permanent maintenance burden that fails *silently*, which is exactly why this
  went unnoticed for months. **Replaced by local Whisper transcription** (item 5 below).
  The `"youtube"` service is removed, with a config patch stripping it from existing
  installs so they still boot. Original text:
  YouTube-side API/mechanism change (not yet diagnosed). Current implementation:
  `df-downloader-service/src/utils/youtube/youtube-subs.ts` (`fetchYtSubs`/`getYtSubs`)
  pulls a caption track's `baseUrl` straight out of
  `ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks` and
  fetches it directly - wired up as the `"youtube"` `SubtitlesService` in
  `media-utils/subtitles/youtube.ts` (config already supports selecting it alongside
  Deepgram/Google STT, see `subtitles-config.ts`). Start by actually attempting a fetch
  against a real video and seeing what currently happens (network error? empty
  response? YouTube now requiring a signature/session token on timedtext URLs is a
  plausible cause, given known YouTube-side hardening in this area, but unconfirmed) -
  diagnose before assuming a fix approach.
- [ ] **4. Claude-API-powered content summaries.** **No longer blocked** - #3 resolved
  the transcript question decisively: there are no YouTube subs, and local Whisper now
  produces a transcript of every download as a by-product. So the "summarize from the
  audio stream" branch below is simply the path, and the transcript already exists rather
  than needing new infrastructure. The cost unknown the owner flagged (Claude generating
  subtitles itself for ~2-hour DF Directs) is moot for transcription - Whisper handles
  that locally for free - but still applies to summarization input size. Original text: New feature: a
  configurable Claude API token, used to generate a text summary of each piece of
  content. Explicit ordering from the project owner: if YouTube subtitle extraction
  (#3) works, summarize from subs (cheap/fast). If not, summarize from the audio stream
  - needs a transcript first, which could reuse the existing Deepgram/Google STT
  subtitle-generation infra already in `media-utils/subtitles/` rather than building a
  new transcription path. Also floated as worth investigating: using Claude itself to
  *generate* the subtitles from audio in the no-YouTube-subs case - flagged by the
  project owner as a cost unknown worth sizing up front, since some DF content (e.g.
  long-form DF Direct episodes) runs ~2 hours. Needs: a new config field for the API
  token (follow the existing `df-downloader-common` config-schema-drives-the-UI-form
  pattern - see `CLAUDE.md`'s "Conventions worth knowing"), a summarization
  task/pipeline step, and a UI surface to display the result (and to enter/manage the
  token, mirroring how the DF `autologin` cookie's settings form works).

- [x] **5. Local subtitle generation with Whisper.** **Done 2026-08-27**, added as the
  replacement for #3 rather than as a planned item. Transcribes the downloaded file's own
  audio via whisper.cpp: no API key, no per-use cost, no ToS or circumvention question,
  and nothing that breaks when a third party changes their mind. Because it transcribes
  the file itself the timings are the file's own, so the sponsorship realignment from #2
  doesn't apply to subtitles at all - only chapters still need it. Everything is
  configurable (model, threads, language, model dir, binary path, term corrections) and
  the settings UI generates from the zod schema as usual.
  - Measured on a 660s video at 16 threads, and scaled to the owner's 8-core i3-N305
    (~6-8x slower): `tiny.en` 51x realtime, `base.en` 35x, `small.en` 14x - so a 2-hour
    Direct is roughly 17/24/60 minutes on that box. `base.en` is the default.
  - Accuracy on DF content: `small.en` matched YouTube's own ASR on every proper noun
    tested (GeForce, 4A Games, Metro 2039), `base.en` missed some, `tiny.en` missed all
    of them and isn't usable here.
  - **Whisper's initial prompt does not fix jargon** - it only conditions the first
    30-second window, and measured across a full transcript it changed nothing ("UE5"
    stayed "UA5"). The configurable term-correction list is what actually works. Don't
    re-litigate this by adding a prompt field.
  - The Docker image builds whisper.cpp (pinned) in a separate stage and copies out the
    single static binary; models download on first use into the config dir, which is a
    persisted mount, rather than the work dir which is scratch.

### Also done in this session (2026-08-27), not planned items

- **New content could be missed permanently.** `getNewContentList()` used
  `automaticDownloads.maxContentAgeHours` as its *pagination stop condition* as well as
  the download gate, so discovery gave up after roughly one page - and `scanWholeArchive`
  resumes near its saved checkpoint at the *oldest* end of a newest-first listing, so it
  never revisits page 0. Anything that aged past the window before the next poll was
  invisible forever. A dev install had missed ten videos over twelve days, some only
  hours old. Discovery now walks newest-first until a whole page is already known
  (bounded at 20 pages), and a check runs on startup and on sign-in rather than only on
  the timer.
- **Descriptions were flattened into one run-on block**, in the UI (HTML collapsing
  newlines) and in the embedded file metadata (`mediaSanitise` replacing every newline
  with a space). Neither the container nor the players required that - MP4 round-trips
  newlines through ffmpeg fine.
- **The request queue indicator** now lists what's actually queued, what each request is
  for, and which phase it's in - "queued: 0 / in flight: yes" read as self-contradictory,
  and "in flight" was true while a request was merely asleep in the spacing gate. Adds a
  manual "Scan now" button, since nothing could previously trigger a new-content check on
  demand.
- **`parseSrt` returned the entire file as one subtitle line** for any CRLF-terminated
  SRT (it compared the untrimmed line against `""`). Also affected `extractMediaSubtitles`
  on the refresh-metadata path, so this was a pre-existing latent bug, not just new-code
  fallout.

### Queued follow-ups (not started)

- **Deferred subtitle generation** is done for the "after download" case
  (`automaticGeneration: after_download` + `subtitlesOutput`, 2026-08-27). The file lands
  and is recorded first, then subtitles are queued separately, so a long transcription no
  longer holds up its own download. Sidecar-by-default for that path went in as intended -
  replacing a file Plex/Jellyfin may be streaming is at best undefined.
- **A `scheduled` subtitles mode** is the remaining piece: defer generation not just past
  the download but to a time when the machine is otherwise idle. **Open decision, needs
  the project owner**: a fixed time window (say 02:00-06:00, predictable, easy to reason
  about, but happily transcodes into a machine that's busy for unrelated reasons) versus
  idle detection (adaptive, but "idle" on a box also running Plex is a judgement call, and
  a half-finished transcription that gets suspended mid-file is worse than one that never
  started). Not worth building until that's settled - the two lead to different designs,
  not just different config.
- **GPU/iGPU acceleration for Whisper** (OpenVINO or Vulkan on the N305's Intel UHD).
  Caveat: that iGPU is probably already doing QuickSync for Plex, so this may relocate
  contention rather than remove it. Measure before assuming a win.
- **Docker image size.** `npm ci` creates a 961MB layer including devDependencies; the
  later `npm prune --omit=dev` can't reclaim it because layers are additive. A multi-stage
  build copying only `dist/`, `public/` and production `node_modules` would likely cut
  this substantially. (The 2.94GB reported locally vs ~713MB on DockerHub is just
  uncompressed vs compressed, not a regression.)
