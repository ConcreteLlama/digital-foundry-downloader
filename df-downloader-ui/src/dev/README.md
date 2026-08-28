# Dev-only task fixtures

Fake task-pipeline state for the Downloads/Activity page, so its live states can be
looked at without running a real download against digitalfoundry.net.

## Why

The states worth designing against - a download mid-flight with numbers moving, a long
post-processing step part-way through, a pipeline that died at step N with an earlier
step skipped - only exist while something is genuinely downloading. Reaching them for
real is slow, and it puts load on DF's servers just to check a layout. Before this,
they got hand-built in the console each time.

## Using it

**Settings → Dev → Task fixtures.** The page is gated on the `devModeEnabled` config
flag like the rest of that section, and the panel itself only exists in a dev build.

From the console, if that's quicker:

```js
__DF_FIXTURES__.list()            // ids, labels, descriptions
__DF_FIXTURES__.play("failed")
__DF_FIXTURES__.setTicking(false) // freeze an animated scenario
__DF_FIXTURES__.step()            // advance one frame while frozen
__DF_FIXTURES__.stop()
__DF_STORE__.getState().tasks     // the real store, also dev-only
```

## Scenarios

| id | what it shows |
| --- | --- |
| `downloading` | one download in flight; percentage, bytes, speed and ETA all move |
| `post-processing` | download done, subtitle generation part-way through, with its own progress bar and ETA |
| `failed` | failed in Inject Metadata, with Generate Subtitles skipped before it |
| `cancelled` | cancelled mid-download, later steps never reached |
| `paused-and-retrying` | one paused by hand, one backing off between retries, one force-started |
| `long-queue` | two running, six queued, two finished, two scheduled auto-downloads |
| `empty` | the empty state |

`downloading`, `post-processing` and `long-queue` animate (500ms per frame); the rest
are static. "Advance progress" freezes and unfreezes them.

## What it does to the app while playing

- A striped warning banner sits across the top of every page, with a Stop button, and
  every fixture title is prefixed `[FIXTURE]`. Fixture content keys start with
  `fixture-`, so any request one accidentally provokes is obvious in the network tab.
- **Task pushes from the backend are held back.** The service pushes a fresh snapshot
  over SSE (`subscribeToChannel("tasks", ...)` in `App.tsx`), which would otherwise wipe
  the fixture within a second. While a fixture plays, `store.dispatch` is wrapped and
  any `tasks/QUERY_TASKS_SUCCESS` that didn't come from the fixture is dropped. Every
  other channel, and every other action, is untouched - the stream itself stays open and
  keeps its reconnect behaviour.
- **Stopping clears the task list** rather than leaving fake entries behind. The next
  real push repopulates it, and for an idle app that only happens when something
  actually changes - so an empty page right after stopping is expected, not a bug.
- The task control buttons (pause/cancel/reorder) still POST to the real API with
  fixture ids, which the service will reject. That's fine for looking at layouts; don't
  read anything into the resulting console errors.

## Keeping it out of production builds

`src/dev/` is reached only through an `import.meta.env.DEV` guarded lazy import in
`components/settings/dev-settings-form.component.tsx`. In a production build that
constant folds to `null`, the dynamic import goes with it, and rollup drops the chunk.
Verified by building and grepping `dist/` for the fixture markers - nothing.

Keep the guard inline where it is. Assigning it to a variable first, or importing any
of these modules statically, puts the whole thing back in the shipped bundle.

## Keeping the fixtures honest

Everything here is built against the real models in `df-downloader-common`, fully typed,
with no `any` shortcuts - so a model change breaks `check-build` here rather than
letting the fixtures drift into fiction. `DOWNLOAD_PIPELINE_STEPS` mirrors
`df-downloader-service/src/task-pipelines/download-task-pipeline.ts`; if a step is added
there, add it here too.

One trap worth repeating: a step's state lives at `stepTasks[stepId].status.state`, not
at `stepTasks[stepId].state` (see `selectTaskState`). Putting it at the task root
silently renders every step as "skipped".
