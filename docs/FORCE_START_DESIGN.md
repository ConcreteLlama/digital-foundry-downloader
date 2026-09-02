# Force start — what it does, what it should do

Companion to `docs/TASKS_AND_PIPELINES.md`, which is required reading first. This
file is about one control action, because it turned out to be the one that most
badly fails that document's own test: *verify a control action against a queued
task, on a held queue, across a step boundary, on more than one manager.*

Everything below was established on 2026-09-02 by reading the code and by running
the real `TaskManager`, `TaskControllerTask` and `TaskPipelineExecution` classes
in a throwaway harness outside the repo — real classes, fake tasks that just
`sleep()`. No code was changed. Where a claim was only read and not run, it says
so.

## What force start does today, precisely

Three call sites, one implementation:

- UI: `ForceStartButton` (`components/tasks/task-controls.component.tsx`) →
  `controlPipeline(pipelineId, "force_start")`. Offered whenever the current
  step is `idle`, or `paused` with `pauseTrigger === "auto"` — for **every**
  task type, with no per-type gating and no `capabilities` check.
- Service: `POST /api/tasks/control` → `DfTaskManager.controlPipeline()` /
  `controlTask()` → `controlTaskManagerTask()` → `case "force_start":
  managedTask.forceStart()`.
- `ManagedTask.forceStart()` (`task-manager/task/task-manager-task.ts:124`) is,
  in full:

```ts
forceStart() {
  this.task.start(true);
}
```

That is a direct call on the `Task`, not on the `TaskManager`. `Task.start(force)`
(`task-manager/task/task.ts:195`) sets `this.forceRunFlag = force === true` and
then dispatches `"start"` at the task's own FSM.

So force start goes **around** `TaskManager.startTask()`, and therefore around
all four things `startTask()` does:

| `startTask()` does | `forceStart()` |
| --- | --- |
| refuses unless `isStartable()` | no check |
| `startingTasks` double-start guard | skipped |
| serialises starts on the manager's `Mutex` | skipped |
| starts with `start()`, i.e. `forceRunFlag = false` | `start(true)` |

The pipeline-level force is not a pipeline-level anything: `controlPipeline` with
no `stepId` resolves `getCurrentStep()` and forces that one step's task. Nothing
is recorded on the execution, so the next step inherits nothing.

`TaskManager` reacts to the flag in exactly one place —
`reassessRunningTasks()` will not requeue a running task whose `forceRunFlag`
is set (`task-manager.ts:260`). A second place *intends* to react and cannot:
`addTask()` builds a `forceRunFlagChangedListener` that would call
`reassessRunningTasks()` when the flag clears, then registers and unregisters it
in adjacent lines inside `completedListener` (`task-manager.ts:96-106`). Because
`CachedEventEmitter.on()` replays, its only real effect is one extra
`startEligibleTasks()` call at completion time for tasks that were forced. Its
stated purpose never happens.

### Observed behaviour of the current implementation

Run against the real classes:

| Scenario | Result |
| --- | --- |
| queued task, queue held | starts and runs to completion — this part works |
| queued task, limit 1, one already running | **both run.** Concurrency limit ignored |
| task already `running` | `Invalid action start for state running` — an **unhandled promise rejection**. `forceStart()` returns void and nothing awaits or catches it |
| completed task | silently does nothing, but sets `forceRunFlag = true` for good, so the row keeps reporting `forceStarted` |
| clearing `forceRunFlag` on an over-committed running task | nothing happens; the dead listener above |

The unhandled rejection is logged rather than fatal — `src/index.ts:24` installs
a `process.on("unhandledRejection")` handler that logs and continues. Without it
this would terminate the service.

## The reported bug, re-diagnosed

The report: queue held, owner force-starts a download, it runs step one and
stops; every subsequent step has to be forced by hand; at the end the pipeline
says **success** while "Move File" still shows **running** with `Elapsed 0.0s`,
and the content item reads "available" rather than downloaded.

Symptoms 1 and 2 are exactly as diagnosed, and both reproduce:

**1. A held manager starts nothing, including the next step of a pipeline in
flight.** `getEligibleStartableTasks()` returns `[]` outright when `queueHeld`,
before it ever looks at a task (`task-manager.ts:190`). Force start is the only
thing that still moves. A pipeline's steps span several managers
(`docs/TASKS_AND_PIPELINES.md`, "There is no single queue"), so "pause all"
holds all nine and a running pipeline stops dead at its next step boundary. In
the harness: force step 1 of a four-step pipeline over two held managers, and it
completes step 1 and then sits at step 2 `idle` indefinitely; releasing the hold
on the second manager is what lets it continue.

**2. So the user hand-cranks every step.** Directly follows.

**Symptom 3 is a different bug, and force start is not its cause.** This is the
important correction: the "success while a step still reads running" snapshot
reproduces with **no force start anywhere**, on free queues, running normally.

The mechanism is `FSM.dispatch` ordering (`src/fsm/fsm.ts`). The transition
function runs *before* the new state is assigned:

```ts
this.state = stateTransition({ ... });     // <-- body runs first
...
if (dispatchStartState !== this.state) this.emit("stateChanged", this.state);
```

The `complete` handler's body does `context.result = payload` →
`TaskControllerTask`'s result callback → `Task.setResult()` → sets `_endTime`
and emits `"completed"` — **synchronously, while `fsm.state` is still
`"running"`.** `Task.getTaskState()` reads the FSM directly rather than the
cached `lastTaskState`, so for the duration of that call stack the task reports
`running` with `endTime` already set.

Everything downstream runs inside that window: the manager's `completedListener`,
`ManagedTask` emitting `taskCompleted`, the pipeline's handler calling
`runNextTask()` — and, when the remaining steps' `taskCreator`s return `null`
(the "Write Subtitles" step does exactly this whenever there is no sidecar to
write), the pipeline emits `completed` from inside it too. `DfTaskManager`
subscribes `notifyChanged()` to both `stepCompleted` and `completed`
(`df-task-manager.ts:318-319`), so a snapshot is pushed *from inside the window*
and captures the finishing step as `running`. Harness output, no force start
involved:

```
SNAPSHOT taken inside 'completed' (success): 0:S1=success(end set)  1:S2-move=running(end set)  2:S3-null=<none>
SNAPSHOT one tick later:                     0:S1=success            1:S2-move=success           2:S3-null=<none>
```

`Elapsed 0.0s` is not a symptom at all — `stepElapsed()` renders `endTime -
startTime`, and moving a finished file within one filesystem is a rename. Zero is
the honest number.

Two consequences for this design:

- **Fixing force start will not fix symptom 3.** It needs its own fix, and it is
  in `FSM.dispatch` or in when snapshots are taken, not in force start.
- Force start makes it *conspicuous* rather than causing it. Normally the window
  closes a microtask later and the repairing `taskStateChanged` snapshot lands
  before anyone looks. On a hand-cranked pipeline the bad snapshot is the last
  interesting thing that happens for however long it takes the user to notice
  and press the button again.

The suggested fix for symptom 3, kept out of scope here: have the `complete`
transition assign the state before running the notification cascade — most
cheaply by deferring `setResult()` to a microtask in
`TaskControllerTaskContext`'s result callback, so `emit("completed")` always
happens after `this.state` is settled. That reorders every completion in the
system and needs its own verification pass.

**The unrecorded download I could not explain.** `recordDownloadOnCompletion`
(`df-content-manager.ts:1456`) is the only writer, it hangs off the pipeline's
`completed` event, the pipeline did emit `success`, and `CachedEventEmitter`
replays so even a late subscription fires. What I can point at is that
`this.db.contentDownloaded(...)` is called without `await` and without `.catch`
at both `df-content-manager.ts:1464` and `:1897` — a rejected write there
becomes a logged unhandled rejection and the download is silently never
recorded. That is a real robustness gap in the one write that matters, but I
have no evidence it is what happened here. See "What could not be verified".

## What force start should mean

**"Run this one thing now, out of turn — and keep this pipeline going."**

Not "run it at any cost", and not "suspend the rules for everything". Each
bypass, argued separately.

### Force should go through `startTask()`, not around it — yes

Not because of double-start: the FSM already refuses a second `"start"` in
`running`, so two copies of the same work cannot run. The FSM, not the manager's
`startingTasks` set, is the real last line of defence, and it holds.

The reasons that do stand up:

- The refusal is currently an **unhandled promise rejection** rather than an
  answer. Nothing awaits `forceStart()`, `controlTaskManagerTask` does not catch
  it, and the endpoint returns 200. That is the same failure shape
  `docs/TASKS_AND_PIPELINES.md` calls out three times — a control that reports
  success and did something other than what it said.
- Going through the manager is the only way to consult the concurrency limit,
  which the manager owns and the task knows nothing about.
- It gives the action a **return value**, which is what the UI needs in order to
  stop lying.

Concretely, on `TaskManager`:

```ts
export type ForceStartOutcome =
  | "started" | "already_running" | "at_capacity"
  | "not_startable" | "completed" | "not_found";

forceStartTask(taskId: string): ForceStartOutcome
```

which validates, releases any per-task hold, and calls the existing private
`startTask(wrapper, /* force */ true)`. `startTask` gains a `force` parameter it
passes to `task.task.start(force)` — note that today it calls `start()` with no
argument, which *clears* `forceRunFlag`, so the parameter is needed for
correctness, not just tidiness.

`ManagedTask.forceStart()` becomes `return this.taskManager.forceStartTask(this.task.id)`.

Verified in the harness: force-starting a running task now returns
`"already_running"` and produces no unhandled rejection.

While in `startTask`, add the missing `await` on `this.mutex.runExclusive(...)`
(`task-manager.ts:243`). It is currently fire-and-forget, so
`startEligibleTasks()`'s `await this.startTask(task)` awaits nothing and the
serialisation the mutex exists to provide is weaker than it reads. This is a
behavioural change in the normal path and should be treated as one.

### Force should be exempt from the queue hold — yes

This is what the user is asking for. A hold whose only override is a mechanism
that also breaks the bookkeeping is not a good hold.

Routing force through `forceStartTask()` rather than through
`getEligibleStartableTasks()` gives this for free and keeps the hold meaningful
for everything else. Verified: with a two-task held manager, forcing one runs it
and leaves the other `idle`; `isQueueHeld()` is still true afterwards. The hold
governs everything the user did not point at.

The per-task hold (`setTaskHeld`) is a different question. Force should clear it,
because "hold this one" and "run this one now" are the same statement in opposite
directions and the later one should win — silently refusing because of a hold the
user set themselves and has probably forgotten is worse than obeying. Verified:
`forceStartTask` on a queued, individually-held task returns `"started"` and the
hold is dropped.

### Force should respect the concurrency limit — yes, with a declared exemption

This is the substantive change, and the one the machine is asking for. The
original reasoning — "what's another download" — is sound *about downloads* and
was never true of the things force start is now offered on. Transcription and
local analysis are RAM- and CPU-bound on a microserver.

`localComputeGate` does not make this moot, and should not be leaned on:

- It is taken **inside the work** (`llama-cpp.ts:152` exclusively,
  `whisper.ts:195` shared), not around the task. A second force-started analysis
  therefore *starts*: the manager counts it running, its stopwatch runs, the UI
  shows it going, and it sits blocked in the gate. That is a lie in the UI and a
  wasted concurrency slot, not a refusal.
- It only covers the two task types that take it. `mediaProcessingTaskManager`
  runs at 1 because whole-file remuxes and moves are disk-bound
  (`df-task-manager.ts:191-199`) and takes no gate at all; two at once is a real
  regression that nothing would catch.
- Force start reaching a manager's limit is a *scheduling* question. The gate is
  a resource lock. Using a resource lock to paper over a scheduler that ignores
  its own limit is how the "manager believes it freed a slot" family of bugs got
  written in the first place.

So: force respects `concurrentTasks`, and a manager may declare headroom. In the
harness, with allowance 0 and one task already running at limit 1, force returns
`"at_capacity"` and max observed concurrency stays 1; with allowance 1 it returns
`"started"` and reaches 2.

**`at_capacity` should refuse, not reorder.** It is tempting to make the refusal
useful by moving the task to the front of its queue. Do not: `changeTaskPosition`
calls `reassessRunningTasks()`, which requeues the now-displaced running task
via `pause("auto")` — a silent no-op on any type that never implemented pause —
and the manager then starts the forced task believing the slot is free. That is
precisely the hazard `docs/TASKS_AND_PIPELINES.md` documents. The honest answer
is to say "it will run as soon as a slot frees" and leave the existing, separate,
deliberate reorder gesture alone.

**`reassessRunningTasks()`'s existing exemption for forced tasks should stay,**
and only now has a coherent justification. Once force respects the limit, a
forced task is inside the window and would not be requeued anyway — *except*
when it used declared headroom, which is exactly the case the exemption
protects. Verified: an over-committed forced task survives a subsequent reorder
rather than being silently "paused".

The dead `forceRunFlagChangedListener` should be deleted rather than repaired.
Its intent — requeue a task when its force flag is cleared — has no caller now
that the flag is only ever set by the manager itself, and reviving it would
re-introduce the requeue hazard on task types that cannot pause.

### Force should propagate along the pipeline — yes

Otherwise the user hand-cranks, which is the behaviour that made symptom 3
visible.

`TaskPipelineExecutionOpts.priority` is the right precedent in shape but not in
lifetime: `priority` is fixed when the execution is constructed, whereas force is
a decision taken mid-run. So it is a **sticky flag on the execution**, set by the
action, and read at the single point a step is queued — the same one line that
already forwards priority:

```ts
const managedTask = pipelineStep.taskManager.addTask(task, {
  priority: this.executionOpts.priority,
  forceStart: this.forceRun,
});
```

with `AddTaskOpts` gaining `forceStart?: boolean`, and `addTask` calling
`forceStartTask(task.id)` instead of `startEligibleTasks()` when it is set. The
pipeline-level entry point:

```ts
forceRunNow(): ForceStartOutcome | "completed" | "no_task"
```

sets `this.forceRun = true` and force-starts the current step.

Sticky, not one-shot, because a pipeline whose next step lands on a held manager
stops again immediately. Verified end to end: four steps across two held
managers, one `forceRunNow()`, and the pipeline runs to `success` with both holds
still on and nothing else on either manager started.

This is safe *given* the concurrency recommendation below. Downstream steps land
on managers with zero headroom, so a forced step there starts only when a slot is
genuinely free — which on a held queue means "carry on with this one pipeline",
and on a free queue means "behave normally". Sticky force does not compound.

Two accepted warts: the flag stays set after the hold is released (harmless — it
only bypasses a hold that is now off), and `forceStarted: true` therefore shows
on every step of that pipeline.

## How a task type declares what is safe to parallelise

The declaration belongs on the **`TaskManager`**, not on `TaskInfo`:

```ts
export type TaskManagerOpts = {
  ...
  /** How far above `concurrentTasks` a force start may go. Default 0. */
  forceOverCommit?: number;
};
```

`capabilities` on `TaskInfo` is the right *precedent* — an honest per-type
declaration, consulted rather than trusted, already used this way by
`controlAll` (`df-task-manager.ts:1114`) — but it is the wrong *home* for this
one. `capabilities` is a wire model derived per task instance in `makeTaskInfo`;
concurrency safety is a property of the pool, is needed before the task starts,
and is enforced by the manager. Two managers already vary their limit at runtime
from config (`SubtitlesTaskManager`, `DownloadTaskManager`), and the same knob
should sit next to the number it modifies.

`capabilities` still earns a new member, derived from the manager so there is one
source of truth: `"force_start"`, meaning *force-starting this can exceed the
limit — it will run alongside what is already going*. That is what the UI needs
to word its confirmation honestly, and it is the same kind of statement as
`"pause"` and `"cancel"`: "this gesture will actually do something".

Proposed values, from what each manager is bound by
(`df-task-manager.ts:175-267`):

| Manager | Limit | `forceOverCommit` | Why |
| --- | --- | --- | --- |
| `downloadTaskManager` | config | **1** | network-bound; the original "what's another download" reasoning, and the only place it holds |
| `fileTaskManager` | 5 | 1 | stat/ffprobe, cheap |
| `mediaProcessingTaskManager` | 1 | **0** | whole-file disk IO; two at once is why the limit is 1 |
| `subtitlesTaskManager` | config (1) | **0** | CPU-bound; the config value is the user's answer already |
| `aiAnalysisTaskManager` | 1 | **0** | local analysis is RAM-bound and takes `localComputeGate` exclusively; remote analysis is money |
| `dfFetchTaskManager` | 1 | **0** | deliberate politeness to a small team's infrastructure |
| `youtubeFetchTaskManager` | 1 | 0 | same |
| `maintenanceOperationsTaskManager` | 1 | 0 | batch moves over the library |
| `bulkOperationsTaskManagers` | 1 each | 0 | already one per target |

The default of 0 matters: a manager added later is conservative unless someone
thinks about it.

## Migration note

**`df-downloader-common/`**
- `models/tasks/base-task-info.ts`: `TaskCapabilities` gains `"force_start"`.
- `models/tasks/tasks.ts`: a response shape for `/control` carrying
  `ForceStartOutcome`, or reuse of the existing envelope with an outcome field.
  The endpoint currently returns `{}` for every action.

**`df-downloader-service/`**
- `task-manager/task-manager.ts`: `ForceStartOutcome`; `forceOverCommit` on
  `TaskManagerOpts`; `forceStart` on `AddTaskOpts`; `forceStartTask()`;
  `runningTaskCount()`; `startTask(task, force)` plus the missing `await` on
  `runExclusive`; `addTask` honouring `opts.forceStart`; delete the dead
  `forceRunFlagChangedListener`.
- `task-manager/task/task-manager-task.ts`: `forceStart()` delegates to the
  manager and returns the outcome.
- `task-manager/task-pipeline/task-pipeline-execution.ts`: `forceRun` field,
  `forceRunNow()`, and `forceStart` forwarded in the one `addTask` call.
- `df-task-manager.ts`: `controlPipeline` routes a `stepId`-less `force_start`
  to `pipeline.forceRunNow()` (the same shape `cancel` already uses, and for the
  same reason); `controlTaskManagerTask` returns the outcome;
  `forceOverCommit: 1` on `downloadTaskManager` and `fileTaskManager`;
  `makeTaskInfo` derives the `"force_start"` capability from
  `managedTask.taskManager`.
- `rest/api/tasks.ts`: return the outcome from `/control`.

**`df-downloader-ui/`**
- `components/tasks/task-controls.component.tsx`: the confirm dialog's text
  should differ by capability — "this will run alongside the work already in
  progress" where `"force_start"` is declared, "this will run as soon as a slot
  frees" where it is not — and the response should surface as a toast rather
  than being discarded. Today the dialog asks the same question for a download
  and for a transcription.
- Force start is currently a pipeline-step gesture only;
  `standalone-task-info.component.tsx` offers no force button even though
  `controlTask` handles the action. Leave that as it is unless asked.

### What has to be tested to trust it

The three checks `docs/TASKS_AND_PIPELINES.md` demands, none of which a
single-step test satisfies:

1. **Against a queued task**, not a running one — force start on `idle`, and the
   `at_capacity` refusal, both of which are about work that has not begun.
2. **Against a held queue with a real multi-step pipeline** — a download with
   subtitles enabled, so it crosses `downloadTaskManager` →
   `fileTaskManager` → `youtubeFetchTaskManager` → `subtitlesTaskManager` →
   `mediaProcessingTaskManager`. One force start must carry it to completion
   with the hold intact and nothing else started.
3. **Across two managers**, which (2) gives, and which is the only way to catch
   force failing to propagate at a step boundary.

Plus, specific to this change:

4. Force start on a running step returns `already_running` and logs no unhandled
   rejection.
5. `subtitlesTaskManager` at limit 1 with a transcription running: force start on
   a second transcription refuses. This is the regression the change exists to
   prevent, and the one that needs a real Whisper run to be convincing.
6. An over-committed forced download survives a drag-reorder on the Activity
   page without the manager starting a third.

**Evidence it worked**: one force start on a held queue completes a whole
download pipeline; `isQueueHeld()` is still true afterwards; no second
transcription or analysis can be started while one is running, by any route; and
the Activity page never shows more concurrent work of a type than that manager's
limit plus its declared headroom.

`df-downloader-ui/src/dev/task-fixtures.ts`'s `mixed-lanes` scenario covers the
UI wording without running anything real. It does not cover the service
behaviour, which is where all of this lives.

## What could not be verified

- **Everything above was run against fake tasks.** The managers, the FSM, the
  pipeline execution and the task wrapper are the real classes; the work is
  `sleep()`. Nothing here has been tested against a real download, a real
  transcription, or a real analysis, and it has not been run on the Unraid
  deployment. Point 5 above in particular needs a real Whisper run.
- **Why the finished download was never recorded is unexplained.** The pipeline
  emitted `success`, and `recordDownloadOnCompletion` is subscribed to that
  event on a replaying emitter. The unawaited, uncaught
  `this.db.contentDownloaded(...)` is the only mechanism I can point at that
  would lose the write silently, and I have no evidence it is the one that
  fired. If this recurs, the log around the download's completion — specifically
  any unhandled-rejection line from `src/index.ts:24` near it — is what would
  settle it. Do not assume the force-start change fixes this.
- **The `FSM.dispatch` reordering was not prototyped.** The window is
  characterised and reproduced; the proposed fix is not. It touches every task
  completion in the system and deserves its own pass.
- **The `await` added to `mutex.runExclusive` in `startTask` changes the normal
  path**, not just the forced one. It is almost certainly what was meant, but it
  was not exercised under load, and "almost certainly what was meant" is how the
  requeue hazard got in.
