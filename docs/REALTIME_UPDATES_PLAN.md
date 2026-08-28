# Real-Time Updates via SSE — Implementation Plan

Status: **implemented on `feature/sse-task-updates` (2026-08-28), milestones 1-3 done
and verified live; milestone 4 (real Unraid deployment) outstanding.** Expands on the
investigation in `docs/INFRASTRUCTURE_PROPOSALS.md`. The plan below is kept as written;
where the implementation deviated from it, see "How it actually turned out" at the end -
read that before treating anything above as current.

## Goal

Replace `App.tsx`'s unconditional 1-second `queryTasks.start()` poll with a real-time
push channel, using the backend's *already-event-driven* task/pipeline/download engine
(`Task` emits `started`/`taskStateChanged`/`completed`; the download engine emits
`stateChanged` with byte-level progress - see `INFRASTRUCTURE_PROPOSALS.md` for the
exact file/line references). No new backend event modeling needed, just a transport
layer that doesn't currently exist.

## Scope for this branch

**In scope**: task/pipeline progress only (the strongest candidate - see
`INFRASTRUCTURE_PROPOSALS.md`'s ranking). **Explicitly out of scope, deliberately
deferred to separate follow-up work** once this pattern is proven:
- The queue status indicator's 5s poll (`QueueStatusResponse` - note this has grown
  substantially since the original investigation, now tracking per-request
  `queued`/`waiting`/`in_flight`/`backing_off` phases - re-read the current shape in
  `df-downloader-common/src/models/queue-status.ts` before touching it).
- The content list's 30s/5s poll (`home.component.tsx`).

Don't expand scope to these without checking in first - get the pattern right for one
case before replicating it.

## Why SSE, not WebSockets

All three real-time candidates in this app are server→client only - nothing needs the
client to push real-time messages back. SSE's plain-GET-request model rides through the
existing Express/REST/auth-middleware stack unchanged (no separate protocol
upgrade/connection-management layer to build), and reconnection is handled natively by
the browser's `EventSource`. Don't reach for a WebSocket library unless a genuine
bidirectional need shows up later.

## Backend plan

1. **New endpoint**: `GET /api/tasks/stream` (mounted alongside the existing
   `/api/tasks` router, same auth middleware as everything else - `EventSource`
   requests are plain GETs, so cookie-based auth works with zero special-casing).
   Response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
   `Connection: keep-alive`.
2. **On connect**: immediately write one SSE event containing the *same shape* the
   current `GET /api/tasks/list` returns (`TasksResponse`) - the client shouldn't need
   a separate initial REST fetch before the stream takes over.
3. **On any task/pipeline change**: re-send the same full `TasksResponse` snapshot as a
   new SSE event, rather than computing/sending a delta. Recommend starting here for
   simplicity - the task list isn't large, and "resend everything on any change" is far
   less backend complexity than diffing, while still being a massive improvement over
   1-second unconditional polling (only fires on actual changes). Revisit if profiling
   ever shows this is too much data per event.
4. **Multi-client support**: more than one browser tab/window can have the UI open at
   once - this needs a subscriber-list pattern (each SSE connection registers its own
   listeners on the relevant `EventEmitter`s and gets its own response stream), not a
   single hardcoded listener assuming one client.
5. **Cleanup**: listen for `req.on('close', ...)` and deregister that connection's
   event listeners when it fires - otherwise reconnects (browser tab refresh, network
   blip triggering `EventSource`'s auto-reconnect) leak listeners on the underlying
   `TaskManager`/`Task`/download-engine `EventEmitter`s indefinitely.
6. **Where to hook in**: `TaskManager` (`task-manager/task-manager.ts`) is the natural
   aggregation point - it already tracks all active `Task`s/pipeline executions, so
   subscribing to whatever it exposes (or adding a re-emitted aggregate event there if
   nothing suitable exists yet) is likely simpler than having the stream endpoint
   individually subscribe to every live `Task` instance's events one by one.

## Frontend plan

1. Replace `App.tsx`'s `setIntervalImmediate(() => store.dispatch(queryTasks.start()), 1000)`
   with an `EventSource` connection to `/api/tasks/stream`, opened once at the same
   point in the component lifecycle the interval currently is.
2. On each `EventSource` message, parse the payload (same `TasksResponse` zod schema
   already used by the REST endpoint - reuse `parseResponseBody`/the existing
   `queryTasks.success` action so the reducer logic doesn't need duplicating) and
   dispatch it into Redux the same way a successful poll response does today.
3. `EventSource` auto-reconnects on a dropped connection by default - verify this is
   sufficient rather than assuming it; if a gap between disconnect and reconnect could
   show stale data for longer than acceptable, consider an explicit "connection lost"
   indicator (nice-to-have, not required for a first version).
4. **Graceful degradation worth a design note, not necessarily required for v1**: if
   `EventSource` fails outright (some corporate proxies/networks block or mishandle
   `text/event-stream`), what happens? A silent "task list never updates again" is bad
   UX. At minimum, log it; consider falling back to the old polling behavior if the
   stream's `onerror` fires repeatedly without ever successfully connecting.

## A real deployment risk worth checking before calling this done

Some reverse proxies buffer streaming responses by default, which would make SSE
appear to "hang" (no updates arrive until the proxy's buffer flushes) even though the
server is sending events correctly. The project owner self-hosts on Unraid - if that's
behind a reverse proxy (nginx/Traefik/similar, common in Unraid setups via
SWAG/NPM), verify events actually arrive promptly in that real environment, not just
against the local dev server. Nginx-style proxies typically need
`proxy_buffering off` (or the app sending `X-Accel-Buffering: no`) for the affected
location/route - can't be fixed from this app's code alone if the proxy config is
outside its control, so this needs a real test against the live deployment, not just
code review.

## Suggested milestones

1. Backend: `/api/tasks/stream` endpoint, single-client, no cleanup yet - prove the
   event pipe works at all (manually verify with `curl -N` or a browser's Network tab
   showing live-arriving events during a real download).
2. Backend: multi-client support + disconnect cleanup.
3. Frontend: swap the poll for `EventSource`, verify Redux state stays correct across
   a full download's lifecycle (queued → downloading → post-processing → complete).
4. Live-test against the real Unraid deployment specifically for the
   proxy-buffering risk above, before considering this done.


---

## How it actually turned out (2026-08-28)

Three things differ from the plan above. All were checked with the project owner first.

### 1. Byte-level progress is NOT event-driven - the plan's premise was wrong

The plan states the download engine "emits `stateChanged` with byte-level progress". It
doesn't. `DownloadFSM` only emits on genuine state *transitions* (`fsm.ts`'s emit is
gated on `dispatchStartState !== this.state`), and byte progress is **pull-only** -
`Download.getStatus()` reads `DownloadContext` on demand. Nothing fires as bytes arrive.

A purely event-driven stream would therefore have left the progress bar and speed
readout frozen at 0% for an entire multi-GB download, then snapped to 100%. The 1s poll
was the only thing animating them.

So the stream does both: **push on state change, plus sample once a second while
something is actually running**, going silent when nothing is. Confirmed live - median
inter-arrival gap of exactly 1000ms during a download, and 0 events over a 10s idle
window in which the old poll made 10 requests.

The same applies to the DF request queue: `df-request-queue.ts` has no emitter at all.

### 2. One multiplexed stream, not one endpoint per data source

The endpoint is `GET /api/stream`, not `/api/tasks/stream`, and it carries **named SSE
channels** (`event: tasks`, `event: queue-status`). Clients use
`addEventListener(name, ...)`. Adding a channel needs no new connection, auth path or
reconnect handling, and the browser's ~6-connections-per-origin cap stays irrelevant.

This decision was deliberately made *before* first deployment - switching from unnamed to
named events is trivial pre-release and a breaking wire-format change afterwards.

The queue-status indicator's 5s poll (listed as out of scope above) was brought in as the
second channel to prove the multiplexing, at the owner's request. It samples every tick
but the broadcaster **dedupes identical frames per channel**, so an idle queue sends
nothing: measured 2 frames for 2 real state changes across a 14s window sampled ~14 times.

### 3. The content list poll remains out of scope, and should NOT be a snapshot channel

Still deferred, but the shape is now clear and it is *not* the same as the other two:
every client has its own page/filter/search/tag query, so there is no single "content
list" the server can broadcast, and the full set is ~3000 entries. It wants a lightweight
`content-changed` **signal** (ideally naming affected keys) with each client re-running
its own query - the win is "refetch only when something changed", not a data push.

### Where things live

- `rest/realtime/stream-broadcaster.ts` - transport-agnostic multiplexed broadcaster.
  Shared across clients: one subscription, one timer, one snapshot build per emission,
  same frame written to everyone. Subscriptions and timers exist only while a client is
  connected.
- `rest/api/realtime.ts` - channel definitions. Adding a channel is a single entry.
- `rest/api/tasks-response.ts` - the snapshot builder shared by `GET /tasks/list` and the
  `tasks` channel.
- `df-task-manager.ts` - aggregate `changed` signal. Deliberately a plain
  `TypedEventEmitter`: tasks and pipelines extend `CachedEventEmitter`, which **replays
  its whole event cache to every new `.on()` listener**, so subscribing per-task would
  flood a client that connected mid-download.
- UI: `store/realtime/realtime-stream.ts` - one shared `EventSource`, ref-counted across
  subscribers, with per-channel REST fallback (at each channel's original poll interval)
  after 3 consecutive errors, and a 30s->5min backoff retry that drops the fallback as
  soon as a stream frame arrives.

### On WebSockets

Considered and rejected again during implementation, for the reasons in the plan. If it
ever becomes necessary, the transport is the small part - the broadcaster produces frames
and knows nothing about SSE beyond `frameFor()`.

### Still outstanding

Milestone 4: verify against the real Unraid deployment. The owner confirmed their own
instance is **not** behind a reverse proxy, so the buffering risk is low for them - but
`X-Accel-Buffering: no` is sent unconditionally anyway, since other installations do sit
behind nginx/SWAG/NPM and can't be asked to edit proxy config.
