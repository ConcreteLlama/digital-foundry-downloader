# Digital Foundry Site Migration Notes

> **Status (2026-08-18): migration complete.** Everything below is a dated
> investigation/implementation log kept for reference — scraping, auth, DB migration,
> and downloads have all been working end-to-end against the relaunched site since
> 2026-08-15, running live on the project owner's real deployment. See `docs/ROADMAP.md`
> for the current phase status and `CLAUDE.md` for a short summary of the further
> live-testing fixes made since (request queue priority, legacy-content download
> guard, YouTube description/duration backfill, etc.) that this doc predates.

Digital Foundry left their old host and relaunched independently at
`https://www.digitalfoundry.net` (new CMS, new HTML, new auth). The old site's archive
was taken down without a video archive at first; as of **2026-08-11 it has one again**
(`/videos`), which is what makes resuming automated scraping viable again. This doc
captures what's been reverse-engineered so far, to save re-discovering it. Everything
here was gathered by fetching pages with a real logged-in browser session's cookies
(the user's own account) — no destructive or bulk actions were taken; large media files
were never fetched, only the HTML listing pages.

## ⚠️ Incident (2026-08-14): the project owner's real IP got banned by DF's Cloudflare

While testing the first live end-to-end run of this branch, `DfUserManager`'s periodic
auth recheck (`setInterval(() => this.checkDfUserInfo(), 10000)` - unconditional, every
**10 seconds**, forever, regardless of whether the last check succeeded) ran against a
known-invalid cookie continuously in the background for several minutes while other,
unrelated issues (missing UI dependencies) were being debugged. That sustained pattern
of repeated rejected requests from one IP got the owner's real IP address banned by
Digital Foundry's Cloudflare protection (`Error 1006: Access denied`). This is exactly
the kind of outcome the "respect DF's infrastructure" principle
([[feedback_respect_df_infra]]) exists to prevent, and it happened because a pre-existing
10-second interval wasn't reviewed with that principle in mind before going live.

**Fixed**: `DfUserManager` now only reschedules its periodic recheck while it currently
believes it's signed in (to catch an organic session expiry), at a much more
conservative 30-minute interval. While not signed in, it does nothing further on a
timer - the only thing that can make an invalid cookie start working is the user
changing it, which already triggers an immediate recheck via
`DigitalFoundryContentManager`'s `configUpdated:digitalFoundry` listener. Not signed in
now means "stop and wait to be told to try again," not "keep hammering the site."

**Status as of this writing**: resolved - the project owner confirmed (2026-08-14, via
their own browser) that the ban has cleared, and gave explicit sign-off to resume live
requests. The Cloudflare 1006 ban did clear on its own after a cool-down, as expected for
adaptive/WAF rules. See "Centralized request queue & rate-limit backoff" below for the
follow-up work this incident directly motivated - a general-purpose safeguard against
this happening again, independent of the specific timer bug that caused it this time.

**Full timer audit done same day**: every `setInterval`/`setTimeout` in
`df-downloader-service/src` was checked. Only one other candidate touches the DF site at
all - the identical unconditional-recheck pattern inside
`DigitalFoundryContentManager.start_reinstate_when_new_site()` (the dead,
never-called pre-relaunch version of `start()` - see `ARCHITECTURE.md`). It's inert
today, but whoever eventually revives that function (re-enabling the recurring
`checkForNewContents()` poll loop, per the Phase 1 roadmap item) needs to apply the same
signed-in-gated/conservative-interval treatment to it, not just copy it as-is. Every
other timer in the codebase (download retry backoff, queue-shutdown polling, a local-DB
polling loop in the `/df-user/await-login` REST endpoint) either doesn't touch
digitalfoundry.net at all or only fires in response to an actively-triggered download,
not as a background loop.

## Centralized request queue & rate-limit backoff (2026-08-14)

The bad-timer bug above was one specific cause of the ban, but not the only risk: before
this change, every caller (`fetchListingPage`, `getDfUserInfo`) called `fetch()`
directly, so nothing coordinated requests *across* callers. The leading suspect for the
"~12 rapid requests triggered a 429" moment noted in `df-fetcher.ts`'s history is
`DigitalFoundryContentManager.refreshMeta()`: it fans out per-item metadata lookups via
`dfFetchWorkerQueue` at **concurrency 5**, and each lookup (`fetchContentInfo` →
`findContentInfoByKey`) can itself issue several listing-page requests (a title search,
then up to `MAX_FALLBACK_SCAN_PAGES` more on a fallback scan) - so 5 concurrent
`refreshMeta` lookups could easily produce a burst of many near-simultaneous requests,
each with only its own *local* pacing and no awareness of the others.

**Fixed**: every direct HTTP request to digitalfoundry.net (both call sites -
`fetchListingPage` and `getDfUserInfo`) now goes through `dfFetch()` in the new
`df-request-queue.ts`, which is the single gate for all of them:
- **Concurrency 1** (via the existing `WorkerQueue` class) with a **randomized minimum
  spacing between requests** (`digitalFoundry.requestSpacingMinMs`/`MaxMs`, a real config
  field - defaults to 5-15s, hard-floored at 5s in the schema), enforced globally
  regardless of which caller or how many logical operations are in flight above it.
  `refreshMeta`'s 5-concurrent-lookups pattern is unchanged (and doesn't need to be) -
  it's now harmless, since all the *actual* network calls it produces simply queue up and
  get spaced out here rather than firing in parallel. The 1s-fixed default from the
  initial version of this fix was revised to 5-15s (randomized, not fixed - "doesn't look
  like a metronome") after the project owner reviewed it and judged 1/sec still too
  aggressive given the earlier ban.
- **Transparent backoff-and-retry on 429/503**, honoring the `Retry-After` header when
  the server sends one (falls back to an increasing default otherwise, capped at 5
  minutes, up to 5 retries before giving up and returning the response as-is). Callers
  don't need their own retry logic - a rate limit now shows up as a slowdown, not a wall
  of failures.

This explicitly does **not** cover downloads - after the initial listing scrape, actual
file downloads hit a signed CDN URL (see the redirect finding below), not DF's own
origin, so they're a different traffic pattern with a different risk profile
(`automaticDownloads.maxContentAgeHours` / the randomized download-delay range already
address *that* side - see `ROADMAP.md`).

**Verified live (2026-08-15)**: exercised against a real full archive scan with the
project owner's own account (IP ban had cleared, explicit sign-off given). Confirmed via
logs that requests land consistently in the configured randomized range and no
429/503 was ever hit. The live scan also surfaced two unrelated pre-existing bugs that
were fixed in the same pass since they were actively breaking things:
- `getSizeMultiplier` (df-downloader-common) only recognized `"B"` for the bytes unit;
  the live site spells out `"bytes"` for very small files, which threw and **silently
  killed the entire archive scan partway through** (an unhandled rejection inside
  `forEachListingPage`'s per-page `.map()`). Also hardened `forEachListingPage` so one
  bad item's parse failure is now logged and skipped rather than aborting the whole scan
  - a scan that dies partway through means every retry re-walks the same early pages
  again, which works directly against the "don't over-query" point of this section.
- `findContentInfoByKey`'s title-search path (`df-fetcher.ts`) crashed with a `reading
  'map' of undefined` TypeError whenever a title had zero matches - the live API omits
  the `items` field entirely in that case rather than returning `[]`. Fixed with a
  defensive fallback.

## Implementation status (2026-08-14)

Phase 1 work is well underway on branch `feature/new-df-site` (off `experimental`, not
yet committed). Done and verified (typechecks clean across all 3 packages; live-tested
against the real site; the DB migration below was run against the real dev `db/`
directory, not just a synthetic test):

- `df-fetcher.ts` rewritten: `autologin`-cookie auth, discovery via `/api/1.0/listing`
  (`forEachListingPage`), new-site media-format parsing
  (`createMediaInfoFromNewSiteListing` in `df-downloader-common`), `dgpConfig`-based
  user/subscriber-tier detection.
- `df-content-manager.ts` updated to match (single-phase discovery — no more
  reference-then-detail-fetch split; `fetchContentInfo`/`refreshMeta` do a best-effort
  title-search-then-scan since the new site has no per-item lookup endpoint).
- **`DfContentInfo.key`/`.name` split** (2026-08-14, prompted by realizing the old
  `name`-as-both-identity-and-filename scheme breaks once content isn't tied to a DF
  URL anymore): `key` is now the stable, namespaced internal identity
  (`yt-<youtube-id>` / `dl-<download-id>` / a preserved `legacy-<old-slug>` for
  un-migrated entries); `name` is now purely a `slugifyTitle(title)`-derived,
  filename-safe cosmetic slug, regenerated fresh for new content but left untouched on
  migrated entries for filename backward-compatibility. `possibleAltKeys` also added —
  every other candidate identifier spotted while parsing an entry (other `dl-<id>`s,
  `mediaId-<id>` from the thumbnail URL), collected as insurance against the site
  changing again, intentionally **not** used for anything yet. This rippled through
  `DfContentEntry.key` (was `.name`), DB storage keys, task/pipeline dedup, and REST
  identity fields (`AddTaskRequest`, `DownloadContentResponse`) — see git history on the
  branch for the full sweep; `content-finder.ts`/`template-utils.ts` correctly kept using
  `.name` since those are genuinely about filenames, not identity.
- **DB migration implemented and verified against the real dev DB**: `content-info-db.ts`
  bumped to `2.6.0` (`CURRENT_DATA_VERSION` bumped to `2.1.0` in common), with a new
  patch step that assigns every existing entry a `key` — `yt-<id>` when
  `youtubeVideoId` was already cached (true for old DF-site scrapes; extracted from an
  embedded YouTube iframe), else `legacy-<old-slug>`. It also directly rewrites
  `content-status-db.json` (bumped to `2.4.0`) with the same key mapping, in the same
  coordinated way the `2.2.0`→`2.3.0` step already did for the content-status/user DB
  split — chosen over passing state between the two DB classes' independent `create()`
  calls, since that wouldn't survive a crash between them. Run against the real 12-entry
  dev DB: all 12 rekeyed (all had cached YouTube IDs — clean Tier-1 case), both existing
  download records preserved and correctly linked to the new keys, automatic pre-patch
  backup created as expected. `dataVersion` is deliberately **not** bumped by this step —
  see "Backfilling stale data" below.

**Done since (see `docs/ROADMAP.md` Phase 1 for current status)**:
- `DigitalFoundryContentManager.start()`'s auto-poll loop - **wired up 2026-08-15**, a
  recurring `setInterval` (`startContentPollLoop()`) calling `checkForNewContents()` on
  `contentDetection.contentCheckInterval` (default raised from a 60s pre-relaunch
  holdover to 30 minutes), skipping entirely while signed out. The mass-auto-download
  risk this note used to flag was already addressed by `newSiteFirstScanComplete` (see
  below) plus `automaticDownloads.maxContentAgeHours` (default lowered to 24h, still
  capped at 168h/1 week) - verified live, the loop fires on schedule and skips cleanly
  while signed out.
- The `videos/download/<id>` redirect + the app's actual download engine - **verified
  working end-to-end 2026-08-15**, first real download success since the relaunch (see
  "Real root cause found and fixed" below for what was actually blocking it - not the
  redirect mechanism itself, which worked as documented).
- `DfSessionCheckDialog` **re-enabled** (2026-08-14, restored from the code the
  Sept 2025 stopgap commit had commented out, copy already generic enough not to need
  changes). **`DigitalFoundryContentManager.start()` now hard-gates scanning on
  confirmed auth**: it never scans the new site unless `DfUserManager.isUserSignedIn()`
  is true (a real `dgpConfig.user.subscriber === true` response, not just "a cookie is
  set") — the new site is partially browsable logged-out (titles/thumbnails, but every
  download link comes back as the literal string `"login"`), and that's deliberately
  not treated as worth scanning. A `configUpdated:digitalFoundry` listener re-checks
  auth and triggers a scan automatically the moment a valid cookie gets configured via
  the UI, without needing an app restart.

### Backfilling stale data (old download URLs, etc.)

Existing entries' `mediaInfo[].downloadUrl` values point at the old, decommissioned
site and are certainly dead. No separate "backfill" step was written for this — it
falls out of two things that already exist:
1. The migration step above deliberately leaves `dataVersion` at its old value, so the
   pre-existing `dataVersion !== CURRENT_DATA_VERSION` check in
   `DigitalFoundryContentManager.patchMetas()` already flags every migrated entry as
   needing a real refetch. `patchMetas()` itself is currently only called from the
   disabled `start_reinstate_when_new_site()`, so this won't happen automatically until
   that's wired back in (see the roadmap item above and the idle-period risk below).
2. Independent of that, `downloadContent()` already calls `getUpdateMediaInfo()` (a live
   refetch, using the best-effort title search) before using cached `mediaInfo` for any
   on-demand download — so triggering a download on a stale entry through the UI
   right now already self-heals its `downloadUrl` first, without needing `patchMetas()`
   at all.

No network calls were added to the DB patch routine itself, on purpose - matching every
other patch step in this file's history, migrations stay pure/offline and fast; bulk
refresh belongs in the existing `patchMetas()`/`refreshMeta()` machinery.

### Resuming after upgrading to this version (solved)

Raised 2026-08-14. **This is not about wall-clock idle time** — it's specifically
about the site-switch itself. Even
someone who ran the tool yesterday, right up until they upgrade to this version, has a
DB that's never been reconciled against the new site at all. The first time
`checkForNewContents()` runs against the new fetcher for a given installation, every
result it finds is "new" relative to that DB by definition — there's no history of
having checked the new site before, regardless of how recently the old one was checked.
Once the auto-poll loop is re-enabled, anyone with `automaticDownloads.enabled` would,
unless something intervenes, have that first run try to download everything the new
`/videos` listing returns in one go.

Note this is distinct from (and in addition to) the DB migration's key-rekeying — even a
freshly-migrated, perfectly-rekeyed entry still hasn't been *confirmed against the new
site* until a scan actually runs; the migration only handles matching existing local
records, not the first live check.

**Why this matters beyond just one user's download queue** (raised 2026-08-14): Digital
Foundry is a small team, not a large CDN-subsidized operation. This tool is
open-source and self-hosted by an unknown number of installations - if a lot of them
independently resume auto-downloading around the same upgrade window (which is exactly
what tends to happen after a new release goes out), that's a real aggregate load/cost
spike on DF's actual infrastructure, not just a "my downloads folder filled up"
inconvenience. Being conservative here isn't just about protecting the user from
themselves.

**Partially addressed already**: `automaticDownloads.maxContentAgeHours` (added
2026-08-14, default 48h, hard-capped at 168h/one week - no "unlimited" option, since
that would defeat the point) now gates auto-download by the content's own publish date,
enforced in `checkForNewContents()`. This substantially limits how much backlog *any*
single check can pull in, including the first post-upgrade one, without needing a
separate transition-specific mechanism.

**Solved (2026-08-14)**: added `newSiteFirstScanComplete`, a new-site-specific sibling
to the existing `firstRunComplete` flag, in `content-status-db.json`
(`DfContentStatusDbSchema`, DB version `2.5.0`). Existing DBs are patched to `false`
(they predate the relaunch by definition); the coordinated key-rekeying rewrite in
`content-info-db.ts` also stamps it `false` directly when it runs the migration inline,
since that path bypasses `content-status-db.ts`'s own patch routine.

`DigitalFoundryContentManager.checkForNewContents()` reads the flag at the top of its
scan (the Patreon-import stopgap that used to have a separate `providedContentInfos`
bypass path was removed 2026-08-15 - see below - so this now applies uniformly).
Content info is still written to the DB as normal either way; only auto-downloading is
suppressed for that one pass, on top of (not instead of) the existing
`maxContentAgeHours` gate. The flag flips to `true` immediately after that first pass,
so every subsequent check behaves normally — this is a one-time transition safeguard,
not a recurring caution.

Exercised live: the auto-poll loop this guards is now wired into `start()` (2026-08-15,
see the "Done since" list above), so this has been verified by
typecheck + code review so far, not a real first-scan-after-upgrade run.

## Auth: replacing the `sessionid` cookie

The old mechanism (documented in the pre-relaunch `README.md`): user logs into
digitalfoundry.net in their browser, manually copies the `sessionid` cookie out of
devtools, pastes it into DF Downloader's settings. `df-fetcher.ts`'s `makeAuthHeaders()`
then sends `cookie: sessionid=<value>` on every scrape/download request. Simple,
low-friction, and it's the pattern users are already familiar with — worth preserving
the *shape* of this UX even though the underlying cookie is different now.

**Finding:** the new site's `autologin` cookie is a direct drop-in replacement.

Tested by capturing a full authenticated cookie jar from `GET /videos`, then re-running
the same request with pared-down cookie subsets:

| Cookies sent | Authenticated? (subscriber:true in response) |
|---|---|
| Full jar (all cookies) | Yes |
| `autologin` only | Yes |
| `CCMSSESSID` only | Yes |
| `autologin` + `CCMSSESSID` | Yes |
| `autologin` only, repeated 3x | Yes every time, same user, not rotated |

- All analytics/tracking cookies (`_ga*`, `_sharedID*`, `panoramaId*`, `__gads`,
  `__gpi`, `__eoi`, `_pubcid`, `__qca`, `_lr_*`, `consentUUID`, `consentDate`, `_cc_id`,
  `dgp-uuid`, `usnatUUID`, `_awl`) are irrelevant — omit entirely.
- `CCMSSESSID` is a server-side session id (the CMS appears to be a custom/in-house
  system, "CCMS" per the cookie prefix). Works alone, but is the kind of cookie that
  typically expires/rotates server-side — not something to ask users to hardcode
  long-term (this is the rough equivalent of the old `sessionid`).
- `autologin` is a persistent "remember me" token (`<selector>~<validator>` shape,
  e.g. `REDACTED-EXAMPLE-AUTOLOGIN-TOKEN`). It
  reliably re-authenticates from scratch on every request, was reused 3x without
  rotating or invalidating, and the server issues a **fresh** `CCMSSESSID` in response
  to it each time (but never rotates `autologin` itself). Behaves as a long-lived,
  reusable credential — not single-use.

**Recommendation:** use `autologin` alone as the new equivalent of `sessionid`. Same
low-friction UX (log in once in browser, devtools → Application → Cookies →
`www.digitalfoundry.net` → `autologin` → copy value). No evidence it needs periodic
refresh in normal use; the tool can just resend the same value on every request the way
it currently does with `sessionid`, and optionally persist whatever `CCMSSESSID` gets
issued back as a minor optimization (not required for correctness).

**How auth state shows up in a response:** the new site embeds a `dgpConfig` JS object
in every page (`var dgpConfig = {...}`) containing:
```json
{"user":{"user":"users/271437","title":"ConcreteLlama","type":"User","subscriber":true,"tier":"DF Supporter", ...}}
```
`subscriber: true` + a real `tier` string + a `Logout` link in the nav
(`<a href="logout">Logout</a>` inside `#userbar`) = authenticated. A logged-out/guest
request instead shows `<img ... alt="Guest">` and `<a href="/users/...">Guest</a>` (note:
`href="/users/ConcreteLlama"` is present even when logged out — the reliable signal is
the avatar alt text / userbar subtitle "User" vs "Guest", not the href). Confirming the
exact logged-out shape wasn't done in this pass (would require a request with no auth
cookies at all) — worth a quick check before writing the "test session" endpoint, but
`dgpConfig.user.subscriber` is almost certainly the field to check.

## New site structure: `/videos` (the supporter video archive)

This is the replacement for the old `/archive?page=N` + per-video-page flow, and it's
**much simpler** — the listing page alone contains everything needed, no per-video
detail page fetch required at all:

- URL: `https://www.digitalfoundry.net/videos?page=N` (page 1 has no query param).
  Standard pagination — `<nav class="ui-listing-pagination">` lists all page numbers,
  `<link rel="next" href=".../videos?page=2">` in `<head>`. 50 items/page. **Note:** the
  rendered pagination nav only lists 15 page links — this is a display cap, not the real
  total. The JSON API below reports the true count directly: ~2,980 videos total
  (`pages: 596` at `limit=5`), consistent with the year-filter checkboxes going back to
  2016.
- Each video is `<section id="listing-videos"> ul.items > li.item.item-df-video`. Per
  item:
  - `.image a.img[href]` and `.info .heading a.title[href]` — **both link straight to
    the YouTube video** (`https://www.youtube.com/watch?v=<id>`), not to a
    digitalfoundry.net detail page. There does not appear to be a per-video DF-hosted
    detail page anymore for `/videos` content — the "content name/slug" concept from
    the old site (`sanitizeContentName` extracting a slug from a DF URL) needs to be
    rethought; the YouTube video ID is the natural stable identifier now.
  - `.info .heading a.title span` text — the video title.
  - `.image img[src]` — thumbnail (`https://images.digitalfoundry.net/media/<id>/300x169.jpg`).
  - `.info ul.list time[datetime]` — published date, ISO 8601 in the `datetime`
    attribute (e.g. `2026-08-11T14:39:27+00:00`); the visible text is a relative/friendly
    string ("5 hours ago", "Yesterday, 3pm") — always use the `datetime` attribute, not
    the text.
  - `.info ul.downloads > li > a.external[href]` — **one `<a>` per available
    format/quality**, `href="videos/download/<id>"` (relative, numeric id, no
    extension/filename — presumably a redirect gated by the auth cookie, resolves to
    the actual CDN file). Link text is `"<FORMAT LABEL><br><em><SIZE> / <FPS> /
    <BITRATE></em>"`, e.g. `4K (H.264)` / `2.82 GB / 60fps / 35.31mbps`, or
    `MP3` / `79.72 MB / 2.0ch / 125kbps` for audio. Observed format labels:
    `4K (H.264)`, `4K (HEVC)`, `1080p (H.264)`, `MP3`, and occasionally a raw resolution
    like `3840x1600 (H.264)` — these do **not** match the old site's `formatString`
    vocabulary or the Patreon-parser's `"4k120"`-style strings, so
    `inferMediaInfo`/`MediaFormatMatchers` in `df-downloader-common` will need new
    parsing rules (or a new dedicated parser) for this label format.
  - No paywall/availability indicator was visible in an authenticated-subscriber
    response — untested what an unauthenticated or lower-tier request returns for
    paywalled content (worth checking: does the `downloads` list simply not appear, or
    appear with different content, for a free/lower-tier account?).
- No description/tags/chapters were present on the listing page itself — if those are
  still wanted, they'd need to come from elsewhere (the YouTube video's own metadata via
  YouTube's API/oEmbed is a plausible source, since every video already links straight
  to YouTube; `df-downloader-service` already has YouTube utilities in
  `src/utils/youtube/` for chapter/subtitle fetching that could potentially be reused
  for this).

## The `/api/1.0/listing` JSON endpoint — preferred over scraping the HTML page

The `/videos` page's listing widget is itself powered by an AJAX JSON endpoint (visible
as `data-param="auth=true&id=videos&type=df-videos"` on the `<section id="listing-videos">`
element). Hitting it directly is a much better integration point than parsing the full
HTML page:

```
GET /api/1.0/listing?auth=true&id=videos&type=df-videos&limit=50&offset=0[&category=X&year=Y]
Header: x-requested-with: XMLHttpRequest   (not strictly verified as required, but sent
                                             by the real site JS — include it)
Cookie: autologin=<value>                  (same cookie as the page request)
```

Response (`Content-Type: text/json`):
```json
{
  "status": "ok",
  "param": {"auth":"true","id":"videos","type":"df-videos","limit":"50","offset":"0"},
  "page": 1,
  "pages": 596,
  "items": ["<li class=\"item item-content item-df-video ...\">...</li>", "..."],
  "query": ""
}
```

- `items` is a JSON array of strings, each one the exact same per-video `<li>` HTML
  fragment documented above — so the same parsing logic (selectors on `.image img`,
  `.heading a.title`, `ul.downloads > li > a.external`, `ul.list time[datetime]`)
  applies to each array element; this endpoint just removes the need to fetch/parse a
  full page shell (nav, footer, ads, sidebar) to get at them.
- **`pages` is the authoritative total page count** for the given `limit` — no need to
  keep requesting pages until an empty one comes back; read `pages` from page 1 and stop
  there. Confirmed at `limit=5`: 596 pages unfiltered (~2,980 videos), 12 pages for
  `category=df-direct&year=2023` (~60 videos) — i.e. **filtering is genuinely
  server-side**, not just a client-side hide/show.
- **Pagination is `offset`, not `page`**, for this endpoint (`page` in the response is
  informational/derived) — confirmed `offset=5&limit=5` returns items 6–10 and reports
  `"page":2`.
- **`auth=true` is a hard requirement for real links.** Omit it (still sending the valid
  `autologin` cookie) and every `href` — the YouTube link *and* every download link —
  becomes the literal string `"login"`, while title/thumbnail/date still render
  normally. This is the server's paywall/entitlement gate; it's plausible (not yet
  tested) that a valid-but-non-subscriber cookie would show the same `"login"`
  placeholders even with `auth=true` set, which would make this a ready-made
  paywall/availability detection signal — worth testing with a free-tier account if one
  becomes available, otherwise: treat "any href equals literal `login`" as "not
  available to this account" in the new fetcher.
- Filter params confirmed working: `category` (values seen in the page's own filter
  checkboxes: `df-direct`, `qa`, `df-retro`, `bonus` — most regular tech-review videos
  carry none of these, i.e. category is an optional narrowing tag, not exhaustive) and
  `year` (2016–2026 per the checkboxes). Useful for resuming/backfilling by year rather
  than always walking from page 1.

### Implication for the rewrite

Use this API endpoint, not HTML-page scraping, as the basis for the new `/videos`
fetcher — same per-item fragment format either way, but with an authoritative page
count, real offset-based pagination, and working server-side filters, for less
integration work than the old `df-fetcher.ts` (which needed one archive-list request
*plus* one per-video-detail request per item — this endpoint plus the fragment parser
covers content discovery in one call per page, no per-video detail fetch at all).

### The `videos/download/<id>` redirect

Confirmed via a header-only (`HEAD`, no body fetched) request:
- With the `autologin` cookie: `302 Found`, `Location:` a signed CDN URL on a different
  host entirely - `https://<id>.rsc.cdn77.org/videos/<Real Filename>.mp4?secure=<sig>,<expiry>`
  - e.g. `Location: https://1628926251.rsc.cdn77.org/videos/Gears of War E Day Multiplayer Beta Xbox H264.mp4?secure=soBij4kbbzAvTqY6v5Q15Q==,1789247831`.
  - The filename is real and descriptive (unlike the `videos/download/<id>` path itself,
    which is opaque) - the trailing number after the comma looks like a Unix-epoch
    expiry for the signed URL.
  - The DF-origin response also sets a fresh `CCMSSESSID`, same as the listing API.
- Without any auth cookie: `302 Found` to `https://www.digitalfoundry.net/login` -
  confirms this endpoint is itself the auth gate, not just the listing.

Implication: the cookie is only needed to resolve the first redirect
(`digitalfoundry.net` → signed CDN URL); the CDN URL itself is self-authenticating via
its `secure=` signature and presumably doesn't need the cookie forwarded to it (typical
CDN signed-URL pattern - not separately verified, but consistent with the URL shape).
`mediaInfo.downloadUrl` is set to the `videos/download/<id>` URL (not the resolved CDN
URL) since it's simpler to store and the redirect only costs one extra hop; a normal
HTTP client following redirects (which `df-downloader-service`'s download engine should
already do, being a generic HTTP downloader) should handle this transparently.

**First real end-to-end download attempt (2026-08-15) - failed, unresolved.** Triggering
a download through the actual app (not a synthetic script) against `yt-LsV1XmJ00UE`'s
`videos/download/7557` link got a `200` landing on `https://www.digitalfoundry.net/login`
instead of the documented `302` to a signed CDN URL - i.e. the same behavior the
reconnaissance above documented for an *invalid/missing* cookie, using the exact same
`autologin` cookie that had, minutes earlier in the same session, driven a full
successful archive scan (which requires a valid authenticated subscriber session to get
real, non-`"login"`-placeholder links in the first place). The response also actively
told the client to forget the `autologin` cookie (`set-cookie: autologin=deleted; ...`)
and issued a fresh `CCMSSESSID`. Ruled out (via one careful manual test each, not
production code changes): the app's download-specific `User-Agent: "DigitalFounload"`
header (removing it made no difference); needing an established browser-style session
cookie from a prior page load (loading `/videos` first issued no session cookie at all,
and the download URL still redirected to login even carrying that request's cookies
forward).

**Confirmed (2026-08-15): this was the specific `autologin` token getting individually
blacklisted, not a general anti-scraping trip or an account-wide block.** A follow-up
check against `/api/1.0/listing` (the endpoint that had run flawlessly all session,
thousands of requests, real links every time) with the *same* cookie now also returns
`"login"` placeholders - the session is dead everywhere, not just on the download path -
confirming the `set-cookie: autologin=deleted` response was literal, not just a
client-side hint. The project owner confirmed their own browser session (different
token, on their phone) is still logged in fine, so this is scoped to the one token used
here, not the account. Working theory: the site treats a saved `autologin` token making
requests that look unusual for a "remember me" cookie (server-side, scripted, hitting
`videos/download/<id>` a handful of times in a short window with no prior page-view
history) as a signal the token may be compromised, and blacklists that specific token
defensively - a narrower, more benign explanation than a blanket bot-detection block.
**Redirect mechanism confirmed working (2026-08-15)**: the project owner manually
clicked the same `videos/download/7557` link in their own logged-in browser and got the
documented 302 → presigned CDN URL (`https://1628926251.rsc.cdn77.org/videos/Oblivion%20Remaster%20Switch%202%20Tech%20Review.mp4?secure=...`)
- exactly matching this doc's original recon and the URL shape
`df-downloader-service`'s download engine already expects.

**Real root cause found and fixed (2026-08-15): `DfTaskManager.downloadContent()` never
sent the `autologin` cookie at all.** `df-task-manager.ts`'s `downloadContent(dfContentInfo,
mediaInfo, directUrl?)` computed `actualDirectUrl = directUrl || mediaInfo.downloadUrl` and
took a "manual download, no DF headers" branch (just `User-Agent: DigitalFounload`, no
cookie) whenever that was truthy. `directUrl` is meant to be explicit-only, for the
manual-download flow's genuinely-external URLs - but the new site's listing populates
`mediaInfo.downloadUrl` directly for every DF-sourced item as a matter of course (unlike
the old site), so the `||` fallback silently routed *every* normal DF download through
the no-auth branch, not just manual ones. The result: an unauthenticated request to
`videos/download/<id>`, which the site correctly redirects to `/login` (matching this
doc's own "without any auth cookie" case above) - a `200` on an HTML login page with no
`Content-Length` header, which is what the download engine's `makeStreamsFromResponse`
was actually choking on the whole time. Fixed by keying the branch off `directUrl` alone
(the explicit param), not the `||` fallback - see the fix's comment in
`df-task-manager.ts` for detail. **This was the sole cause** - the earlier
"token got blacklisted" diagnosis was a red herring from testing in parallel with a
separate diagnostic script that manually included the cookie header (and thus
legitimately triggered whatever the real blacklist/expiry mechanism is, independent of
this bug); the app itself was never sending the cookie for real downloads in the first
place, on any attempt, the whole time. **Verified live 2026-08-15 with a fresh
`autologin` cookie**: the real download engine now correctly authenticates, gets the
CDN redirect, and opens multiple range-split connections (`supportsByteRangeHeaders:
true`, confirmed via response headers) - end-to-end download success confirmed for the
first time since the relaunch. This unblocks re-enabling the auto-poll loop from a
correctness standpoint (see the still-open idle-period/mass-auto-download safeguard
item above, which is a separate concern).

Also updated `makeDfDownloadParams()`'s headers (`df-fetcher.ts`) while investigating
this to mimic a real browser navigation request (realistic `User-Agent`, `Accept`,
`Sec-Fetch-*`, etc., deliberately omitting `sec-ch-ua`/Client Hints since a
slightly-mismatched version pairing can read as more suspicious than omitting them) -
not confirmed necessary for the fix above (the missing-cookie bug was sufficient on its
own to explain every failure observed), but a reasonable defensive improvement given the
old bare `"User-Agent": "DigitalFounload"` was a very obvious non-browser signal, kept
since it doesn't hurt and there's no evidence against it.

Next steps when picking this back up: (1) try a manual browser download first (confirms
whether the mechanism still works as documented at all, independent of this app), (2)
if it does, capture the real request from browser devtools and diff it against what
`df-downloader-service` sends, (3) if manual browser downloads *also* fail right now,
this may just need to cool down before retrying anything automated against it.

This reconnaissance only covered `/videos` and its listing/download API. Still not
checked:
- Whether other historical content types (DF Retro articles, older non-video posts) are
  reachable the same way, or whether `/videos` is video-only and something else covers
  the rest of the pre-relaunch archive.
- Unauthenticated/non-subscriber response shape for `auth=true` listing requests
  specifically (see the paywall-detection note above) - the `videos/download/<id>`
  no-cookie-at-all case above is a different, already-confirmed scenario.

## Backward compatibility: migrating existing users' local DB

Explicit requirement (from the project owner): existing users must **not** be forced to
re-scan their whole archive from scratch when this update ships. Their local
`content-info-db.json` / `content-status-db.json` / `user-db.json` should be patched
in place to the new format/model, preserving whatever can be preserved (existing
downloads, file locations, tags, etc.) rather than starting over. The intent is "one big
patch," run automatically on upgrade, not a manual export/import step.

**This infrastructure already exists and should be reused, not reinvented.** `FileDb`
(`df-downloader-service/src/db/file-db.ts`) is a generic versioned-JSON-file store: on
load it reads the file, runs a `patchRoutine(data)` the caller supplies, backs up the
pre-patch file first, validates the patched result against a zod schema, and only then
writes it back (falls back to the backup on any failure). `DfContentInfoDb`
(`src/db/file-dbs/content-info-db.ts`) is a real, working example of exactly this kind
of migration already having been done multiple times — its `patchRoutine` is a chain of
`if (data.version === "X") { ...mutate... ; data.version = "Y" }` steps walking a
DB through `1.0.0 → 2.0.0 → 2.0.1 → 2.2.0 → 2.3.0 → 2.5.0` (`CURRENT_DB_VERSION` in that
file), including a step that split one old combined DB file into today's three separate
files (`content-info-db.json` / `content-status-db.json` / `user-db.json`).

There's also a **second, finer-grained** version tag: `DfContentInfo.dataVersion`
(`CURRENT_DATA_VERSION` in `df-downloader-common/src/models/df-content-info.ts`,
currently `"2.0.2"`) stamped on every individual content entry. `patchMetas()` in
`df-content-manager.ts` already walks all DB entries and queues a `refreshMeta()` for
any whose `dataVersion` doesn't match current — i.e. there's already a working
"per-entry needs-a-refetch" flag, separate from the whole-file version. This is a
natural fit for the new-site migration: bump `CURRENT_DATA_VERSION`, and existing
entries will be flagged as needing their media info refreshed against the new site
(new format labels, new download URLs) without needing to be treated as brand-new
content or losing their existing `downloads[]`/file records.

**Implemented 2026-08-14** (see "Implementation status" above for the full writeup):
`CURRENT_DB_VERSION` bumped with a `2.5.0 → 2.6.0` patch step in `DfContentInfoDb`,
coordinated with a matching `content-status-db.json` rewrite (bumped to `2.4.0`) in the
same step. `CURRENT_DATA_VERSION` bumped too, but deliberately *not* applied to migrated
entries by the patch step itself — see "Backfilling stale data" above for why. The
`name`/slug question (point 3, as originally written here) was resolved by splitting
identity from filename entirely: `DfContentInfo.key` is the new stable identifier
(`yt-<id>` from the cached `youtubeVideoId`, or a preserved `legacy-<old-slug>` when
that's not available), while `name` keeps meaning "filename-safe slug" and migrated
entries keep their existing `name` value untouched. Verified against the real 12-entry
dev DB — see "Implementation status" for the results.

## Recommended next steps (remaining)

Done (see "Implementation status" above): confirming the `videos/download/<id>`
redirect, the new `df-fetcher.ts`, the `sessionId` field's UI copy, the `key`/`name`
split, and the DB migration. Remaining:

Remaining open item from the original recon:
- Confirm whether other historical content types (DF Retro articles, older non-video
  posts) are reachable the same way, or need separate handling.

(Everything else this list originally tracked - verifying a real download end-to-end,
the idle-period auto-download safeguard, re-enabling `DfSessionCheckDialog`/the polling
loop, and the Patreon-import path's fate - is done; see the "Done since" list above and
the entries elsewhere in this doc dated 2026-08-15.)
