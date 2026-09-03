# Tasks and pipelines — behaviour worth knowing before you change any of it

`docs/ARCHITECTURE.md` has the map: `Task`, `TaskManager`, `TaskPipeline`,
`DfTaskManager`. This file is the part that isn't guessable from the class names —
the semantics that have already caused real bugs, and the reasoning behind the
guards that now exist. Read it before touching queueing, the Activity page, or
anything that pauses, cancels or reorders work.

Everything here was confirmed against the code and, where noted, against a
running service. Dates are when it was established, not when the code was
written.

## There is no single queue

The most common wrong mental model. `DfTaskManager` constructs **nine**
`TaskManager`s, each with its own queue, its own concurrency limit and its own
position numbering:

| Manager | Concurrency | Used for |
| --- | --- | --- |
| `downloadTaskManager` | `downloadConfig.maxSimultaneousDownloads` | the transfer itself |
| `fileTaskManager` | 5 | cheap filesystem work (stat, ffprobe) |
| `mediaProcessingTaskManager` | 1 | muxing, metadata injection, sidecar writes |
| `localModelsTaskManager` | `localModels.maxConcurrent ?? 1` | **anything running a model here** - transcription and local AI analysis |
| `aiAnalysisTaskManager` | 2 | **hosted** analysis only - Claude calls |
| `dfFetchTaskManager` | 1 | requests to digitalfoundry.net |
| `youtubeFetchTaskManager` | 1 | requests to YouTube |
| `maintenanceOperationsTaskManager` | 1 | batch moves, scans, cleanup |
| `bulkOperationsTaskManagers` | 1 **each**, one per `BulkBackfillTarget` | bulk runs |

Two consequences that are easy to get wrong:

**A pipeline's steps span several managers, so a pipeline changes queue as it
advances.** The subtitles pipeline starts on `localModelsTaskManager` and its
remaining steps run on `mediaProcessingTaskManager`. The download pipeline
touches `downloadTaskManager`, `fileTaskManager`, `youtubeFetchTaskManager`,
`localModelsTaskManager` and `mediaProcessingTaskManager`
across its seven steps. See `src/task-pipelines/*.ts`, where each step names its
manager.

**`TaskInfo.position` is an index within one manager, and means nothing across
two.** Comparing or sorting positions from different managers is meaningless,
and `change_position` moves a task to that index *in its own* queue. This is
why the Activity page only offers reordering within a group whose items all
share a `taskType`, and why the bulk managers being one-per-target is what lets
a subtitles backfill and an articles backfill genuinely run at the same time.

## One queue for local models, and why

`localModelsTaskManager` holds **both** transcription and local AI analysis.
They cannot usefully run together - each already claims most of the cores - so
they take turns in one queue rather than sitting in two with a lock between
them.

There used to be such a lock (`LocalComputeGate`), and it worked, but it sat
*below* the task layer inside a provider call. Three things followed from that,
all of which the shared queue removes:

- **A blocked task reported itself running.** It held a running slot and showed
  no progress, so the manager's count and the truth disagreed.
- **The lock was per call, not per run.** A local analysis is three calls, and
  the lock was released between them, so a queued transcription could take the
  machine mid-analysis and the analysis then waited for it to finish.
- **A task blocked inside a call has no clean cancellation point.** Queued work
  cancels trivially; work stuck in a provider call does not.

**Hosted analysis deliberately does not come here.** It uses none of this
machine, so queueing a Claude run behind a transcription would buy a delay for
nothing. Which queue an analysis lands in is decided per run, from the resolved
engine, in `DfTaskManager.analyseContent` - both pipelines come from the same
factory and differ only in the manager they are given.

## Priority tiers

Lower is sooner. Defined together in `task-manager.ts`, because they only mean
anything relative to each other.

| Tier | Value | Used for |
| --- | --- | --- |
| `FORCED_PRIORITY` | 0 | force-started work |
| `PIPELINE_TASK_PRIORITY` | 1 | work owned by a download pipeline |
| `DEFAULT_TASK_PRIORITY` | 2 | standalone, hand-started work |
| `BACKGROUND_TASK_PRIORITY` | 3 | bulk backfills |

**Within a tier, ordering is arrival order** - `addItem` appends by default.

Pipeline work outranks standalone because a download is not usable until its
subtitles and metadata land, so leaving one half finished behind a long queue of
unrelated requests is worse than either job being slightly late. A pipeline
claims its tier once when it starts and every step inherits it.

This only began to matter when transcription and local analysis started sharing
a queue: before that they never competed, so their relative order was never a
question anyone could ask.

## Control actions do much less than their names suggest

`pause()` and `cancel()` on `Task` dispatch to abstract `pauseInternal()` /
`cancelInternal()`, implemented per task type. **Most task types implement
neither.** `capabilities` on `TaskInfo` is the honest signal — most declare
`[]`; only a few declare `["pause", "cancel"]`. `subtitles-task.ts` contains no
pause handling at all: transcription cannot be interrupted part-way.

The trap: **on a task that has not started, both are no-ops that still report
success.** There is no process to signal, so the call returns cleanly and the
task starts later as if nothing happened. This produced the same bug three
separate times — a control that returned 200, showed a success toast, and
changed nothing. If you add a control action, verify it against a *queued* task,
not just a running one.

What actually works, and why each exists (`src/task-manager/task-manager.ts`):

- **`dequeueTask(taskId)`** — removes an unstarted task from the queue.
  Refuses anything running, which has a real process behind it. This is the only
  thing that genuinely stops queued work.
- **`setQueueHeld(held)`** — stops the whole manager starting anything new,
  without touching what is already running. This is what makes "pause all"
  honest when most of what is queued cannot be paused individually.
- **`setTaskHeld(taskId, held)`** — holds one unstarted task out of selection.
  Held tasks are **skipped over** when choosing what to start, not filtered out
  afterwards: filtering after the fact would let a held task occupy one of the
  concurrency slots, so holding the item at the front of a one-at-a-time queue
  would stall everything behind it — the opposite of what holding one item
  should do.
- **`TaskPipelineExecution.cancel()`** — the pipeline-level stop. It dequeues
  the current step if it hasn't started and emits completion. Cancelling
  *the task* does nothing when nothing has started, which is the state most of a
  queued run is in, so per-item Stop routes through the pipeline.

A held task reports `state: "paused"` with `pauseTrigger: "manual"` plus
`held: true` on `TaskStatus`. The state is what the user did and expects to
undo; the flag is so the UI can keep Stop available on work that never began.
Holding does not change the task's own state, so nothing emits
`taskStateChanged` — the hold pushes a snapshot explicitly, or it would stay
invisible until something else moved.

## `isStartable()` and the requeue hazard

```ts
state !== "running" &&
  (state === "idle" ||
    (state === "paused" && pauseTrigger === "auto") ||
    (state === "awaiting_retry" && retryReady))
```

Note `pauseTrigger === "auto"`: an automatically paused task is startable again,
a manually paused one is not. That distinction is what separates "the manager
parked this" from "a person parked this".

**The hazard.** After any reorder, `reassessRunningTasks()` finds running tasks
that now fall outside the concurrency window and calls `requeue()` on them —
which is `task.pause("auto")`. On a task type that never implemented pause,
that is a silent no-op: **the manager believes it freed the slot and starts
another job while the first is still running.** Nothing errors, nothing logs,
and you quietly get two transcriptions competing for the machine.

This is why the Activity page pins running work that cannot be suspended and
refuses to drop anything above it. Running downloads *are* draggable, because
downloads implement pause — shifting a running download out of the window is a
legitimate way to pause it, and that gesture is deliberately preserved.
`forceRunFlag` exempts a force-started task from being requeued this way.

Anything new that reorders tasks must respect the same rule: never displace a
running task whose `capabilities` lack `"pause"`.

## Persistence and restart

Two separate DBs, and **they do not have the same shape** —
`src/db/file-dbs/pipeline-db.ts`:

- `active-pipelines.json` — `pipelines` is a **record** keyed by id.
- `completed-pipelines.json` — `pipelines` is an **array**.

Bumping `CURRENT_DB_VERSION` runs a patch routine over both. A patch that
assumes one shape crashes the service on startup against the other — this
happened, and the fix was a shape-preserving `mapPipelines`. If you add a
version, exercise it against both files, not just whichever you were thinking
about.

**Restart resumes position, not progress**, and this is intended rather than a
limitation to fix. A resumed pipeline is re-queued at the step it reached, with
its place in the queue restored; work that was mid-flight starts that step
again. Downloads have always behaved this way, and transcription has no partial
state to resume into. Subtitles pipelines used to be skipped entirely on the
reasoning that they could just be re-triggered by hand — which stopped being
true once a bulk run could queue hundreds, where "re-trigger it" means
rebuilding the whole selection.

`MAX_RESUME_ATTEMPTS` guards against a pipeline that crashes the app during
startup resurrecting itself forever; the count lives on the persisted record.

Keep `completed-pipelines.json` lean. It reached 2795KB once because full
transcripts were being archived inside `stepResults`; summarising results on the
way into the archive brought it to 52KB. Anything large that a step returns will
end up in there unless it is summarised out.

## `FileDb` writes are coalesced

`updateDb()` keeps the newest data and collapses repeat calls while a write is
in flight, rather than queueing one write per call (`src/db/file-db.ts`). A
burst of 300 updates produces **one** real `writeFile`. Writes are atomic
(temp + rename) and the JSON is compact.

Two things follow. Don't add your own debounce on top — it is already handled.
And on NextCloud-synced checkouts the atomic temp+rename can intermittently
`EPERM`; that is sync interference rather than a permissions bug, and retrying
with backoff is the fix.

## What the UI does with all this

`df-downloader-ui/src/components/tasks/task-list.component.tsx` groups live work
by pipeline type rather than by stage. Grouping by stage ordered a merged list
by queue position, which buried a running analysis under hundreds of queued
transcriptions — position is a queue index, so the running row sorts wherever
its index happens to fall.

Running items stay in their group rather than being lifted into a separate
"active" area, precisely because they hold real queue positions and shifting one
down is a meaningful gesture. `selectLiveLaneItems`
(`store/df-tasks/tasks.selector.ts`) computes type, state, held, running,
`canPause` and position in one pass, because grouping, filtering and the drag
lock all need the same facts about every item and a hook cannot be called per
row in a loop.

`df-downloader-ui/src/dev/task-fixtures.ts` has a `mixed-lanes` scenario for
this — every other fixture is a download, so none of them exercise more than one
group, or a running task that cannot be paused. Use it rather than firing real
work at digitalfoundry.net to check a layout.
