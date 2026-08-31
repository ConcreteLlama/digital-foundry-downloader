/**
 * Dev-only fake task-pipeline state for the Downloads/Activity page.
 *
 * The states that matter most on that page - a download mid-flight with live
 * numbers, a long post-processing step part-way through, a pipeline that died
 * at step N with an earlier step skipped - only exist while a real download is
 * running against digitalfoundry.net. That makes them slow to reach, and it
 * puts load on DF's servers just to look at a layout. These fixtures stand in
 * for them.
 *
 * This module is DEV ONLY. It is reached exclusively through an
 * `import.meta.env.DEV` guarded dynamic import (see dev-settings-form), so a
 * production build constant-folds that branch away and rollup drops this chunk
 * entirely. Never import it from a module that ships.
 *
 * The shapes here are built against the real models in df-downloader-common,
 * fully typed - no `any` shortcuts - so if the pipeline model changes,
 * `check-build` breaks here rather than these quietly drifting into fiction.
 *
 * THE ONE THING THAT IS EASY TO GET WRONG: a step's state lives at
 * `stepTasks[stepId].status.state`, not at `stepTasks[stepId].state` (see
 * selectTaskState). Put it at the task root and every step silently renders as
 * "skipped".
 */
import {
  BasicTaskInfo,
  DfContentInfo,
  DfPipelineType,
  DownloadProgressInfo,
  DownloadTaskInfo,
  MediaInfo,
  ScheduledDownloadInfo,
  TaskInfo,
  TaskPipelineInfo,
  TaskState,
  TaskStatus,
  TasksResponse,
  makeVideoProps,
} from "df-downloader-common";

/**
 * Prefixed onto every fixture title so a fixture is never mistaken for a real
 * download - on screen, in the Redux devtools, or in a screenshot.
 */
export const FIXTURE_PREFIX = "[FIXTURE]";

/**
 * The real download pipeline's steps, in order, as built by
 * df-downloader-service/src/task-pipelines/download-task-pipeline.ts. Keep in
 * sync with it - the step names drive the icons in the stepper, and the task
 * types decide whether a step renders as a download or as a generic step.
 */
const DOWNLOAD_PIPELINE_STEPS = [
  { name: "Download", taskType: "download" },
  { name: "Measure Duration", taskType: "measure_duration" },
  { name: "Fetch Chapters", taskType: "fetch_chapters" },
  { name: "Generate Subtitles", taskType: "subtitles" },
  { name: "Inject Metadata", taskType: "inject_metadata" },
  { name: "Move File", taskType: "move_file" },
  { name: "Write Subtitles", taskType: "write_subtitles_sidecar" },
] as const;

/** Index into DOWNLOAD_PIPELINE_STEPS, named so the scenarios below read as prose. */
const STEP = {
  download: 0,
  measureDuration: 1,
  fetchChapters: 2,
  generateSubtitles: 3,
  injectMetadata: 4,
  moveFile: 5,
  writeSubtitles: 6,
} as const;

const stepId = (pipelineId: string, index: number) => `${pipelineId}-step-${index}`;

const GIB = 1024 * 1024 * 1024;

const makeMediaInfo = (formatString: string, name: string): MediaInfo => ({
  type: "VIDEO",
  formatString,
  encoding: formatString === "HEVC" ? "HEVC" : "h264",
  mediaFilename: `${name}.mp4`,
  videoProperties: makeVideoProps(formatString === "HEVC" ? "4K" : "1080p", "60fps"),
  audioProperties: {
    encoding: "AAC",
    channels: "2.0",
    bitrate: 320000,
    sampleRate: 48000,
  },
});

const makeContent = (title: string, publishedDaysAgo: number): DfContentInfo => {
  const name = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return {
    // A "fixture-" key makes any request this accidentally provokes obvious in
    // the network tab, and can never collide with a real content entry.
    key: `fixture-${name}`,
    name,
    dataVersion: "2.2.0",
    title: `${FIXTURE_PREFIX} ${title}`,
    description: "Fake content injected by the dev task fixtures. Not a real download.",
    mediaInfo: [makeMediaInfo("h264", name), makeMediaInfo("HEVC", name)],
    thumbnailUrl: "",
    youtubeVideoId: "",
    publishedDate: new Date(Date.now() - publishedDaysAgo * 24 * 60 * 60 * 1000),
    tags: ["fixture"],
    source: "digitalfoundry",
    legacy: false,
    unpatchable: false,
  };
};

const CONTENT = {
  direct: makeContent("DF Direct Weekly 599", 1),
  retro: makeContent("Johns Japanese CRT Adventure", 4),
  stutters: makeContent("Favorite Stutters of 2025", 9),
  techReview: makeContent("Silent Hill f PC Tech Review", 12),
  retrospective: makeContent("Bloodborne 60fps Retrospective", 20),
};

type StepFixture = {
  state: TaskState;
  message?: string;
  error?: string;
  isComplete?: boolean;
  attempt?: number;
  pauseTrigger?: "manual" | "auto";
  forceStarted?: boolean;
  /** Generic 0-100 progress - what the non-download steps report. */
  progress?: { percent: number; detail?: string };
  /** Downloads report this instead: bytes, speed, retries. */
  download?: Partial<DownloadProgressInfo>;
  startedSecondsAgo?: number;
  /**
   * Working time so far, in seconds - what the Active readout divides by.
   *
   * Deliberately settable apart from startedSecondsAgo, because the whole
   * point of the two numbers is that they diverge: a step started five minutes
   * ago and paused after two has Elapsed 5m and Active 2m. A fixture that let
   * them stay equal could not exercise the split at all.
   */
  activeSecondsSoFar?: number;
  /**
   * What this step can be asked to do while running. Defaults to the download
   * step's ["pause","cancel"].
   *
   * Settable because most task types declare none at all - transcription
   * cannot be interrupted part-way - and that is what pins a running row in
   * place rather than letting it be dragged out of the concurrency window.
   * A fixture that always claimed "pause" could not reproduce that.
   */
  capabilities?: BasicTaskInfo["capabilities"];
  position?: number;
};

/**
 * A step with no entry here at all is how the service represents both a
 * not-yet-reached step and a skipped one: the step stays in `stepOrder` but
 * gets no entry in `stepTasks`, and the stepper tells the two apart from the
 * step's position relative to the current one. Leaving a step out is
 * therefore what produces a genuine "skipped" render - there is no explicit
 * skipped state to set.
 */
type StepFixtures = Partial<Record<number, StepFixture>>;

const makeDownloadProgress = (overrides: Partial<DownloadProgressInfo>): DownloadProgressInfo => ({
  startTime: new Date(Date.now() - 90_000),
  runningTime: 90_000,
  totalBytes: 6 * GIB,
  totalBytesDownloaded: 0,
  retries: 0,
  percentComplete: 0,
  currentBytesPerSecond: 24 * 1024 * 1024,
  averageBytesPerSecond: 22 * 1024 * 1024,
  ...overrides,
});

const isTerminal = (state: TaskState) => state === "success" || state === "failed" || state === "cancelled";

const makeStatus = (fixture: StepFixture): TaskStatus => ({
  state: fixture.state,
  message: fixture.message,
  error: fixture.error,
  attempt: fixture.attempt ?? 1,
  isComplete: fixture.isComplete ?? isTerminal(fixture.state),
  pauseTrigger: fixture.pauseTrigger,
  forceStarted: fixture.forceStarted,
  progress: fixture.progress,
  // The two-scalar stopwatch the real service keeps - see
  // TaskStatus.accumulatedActiveMs. lastResumedAt is set only while running,
  // which is what stops Active ticking on a paused row.
  accumulatedActiveMs:
    fixture.activeSecondsSoFar !== undefined ? fixture.activeSecondsSoFar * 1000 : undefined,
  lastResumedAt: fixture.state === "running" && fixture.activeSecondsSoFar !== undefined ? new Date() : null,
});

const makeStepTask = (pipelineId: string, index: number, fixture: StepFixture): TaskInfo => {
  const { taskType } = DOWNLOAD_PIPELINE_STEPS[index];
  const common = {
    id: stepId(pipelineId, index),
    type: "task" as const,
    capabilities: (fixture.capabilities ?? ["pause", "cancel"]) as BasicTaskInfo["capabilities"],
    priority: 0,
    position: fixture.position ?? 0,
    priorityPosition: fixture.position ?? 0,
    startTime: fixture.startedSecondsAgo
      ? new Date(Date.now() - fixture.startedSecondsAgo * 1000)
      : undefined,
    endTime: isTerminal(fixture.state) ? new Date() : undefined,
  };
  if (taskType === "download") {
    const downloadTask: DownloadTaskInfo = {
      ...common,
      taskType: "download",
      status: {
        ...makeStatus(fixture),
        currentProgress: fixture.download ? makeDownloadProgress(fixture.download) : undefined,
      },
    };
    return downloadTask;
  }
  const task: BasicTaskInfo = {
    ...common,
    taskType,
    status: makeStatus(fixture),
  };
  return task;
};

type PipelineFixture = {
  /**
   * Reasons, by step index, that a step is known not to run. Mirrors what the
   * service stamps onto StepDetails from live config.
   */
  notApplicable?: Partial<Record<number, string>>;
  id: string;
  content: DfContentInfo;
  mediaFormat?: string;
  currentStep: number;
  isComplete?: boolean;
  pipelineResult?: "success" | "failed" | "cancelled";
  statusMessage: string;
  steps: StepFixtures;
};

const makePipeline = (fixture: PipelineFixture): TaskPipelineInfo => {
  const { id, content, currentStep, steps } = fixture;
  return {
    id,
    type: "pipeline",
    pipelineType: "download",
    pipelineDetails: {
      id,
      type: "download",
      queuedTime: new Date(Date.now() - 5 * 60_000),
      dfContent: content,
      mediaFormat: fixture.mediaFormat ?? "h264",
      destinationPath: `/fixtures/${content.name}.mp4`,
      stepOrder: DOWNLOAD_PIPELINE_STEPS.map((_step, index) => stepId(id, index)),
      steps: DOWNLOAD_PIPELINE_STEPS.reduce((acc, step, index) => {
        acc[stepId(id, index)] = {
          id: stepId(id, index),
          name: step.name,
          // Steps the service knows in advance will not run, from config
          // alone - shown dimmed with the reason in the details dialog and
          // hidden from the card. See getDownloadStepNotApplicableReasons.
          notApplicableReason: fixture.notApplicable?.[index],
        };
        return acc;
      }, {} as TaskPipelineInfo["pipelineDetails"]["steps"]),
    },
    pipelineStatus: {
      currentStep: stepId(id, currentStep),
      statusMessage: fixture.statusMessage,
      isComplete: fixture.isComplete ?? false,
      pipelineResult: fixture.pipelineResult,
    },
    stepTasks: Object.entries(steps).reduce((acc, [index, stepFixture]) => {
      if (stepFixture) {
        acc[stepId(id, Number(index))] = makeStepTask(id, Number(index), stepFixture);
      }
      return acc;
    }, {} as TaskPipelineInfo["stepTasks"]),
  };
};

/**
 * A one-step pipeline of some kind other than a download.
 *
 * Subtitles and analysis runs queued from the content page are their own
 * pipelines rather than steps of a download, which is what gives the Activity
 * page more than one lane. Every fixture here was a download before this, so
 * nothing exercised the case the lanes exist for.
 */
const makeLanePipeline = ({
  id,
  pipelineType,
  stepName,
  taskType,
  content,
  statusMessage,
  step,
}: {
  id: string;
  pipelineType: DfPipelineType;
  stepName: string;
  taskType: string;
  content: DfContentInfo;
  statusMessage: string;
  step: StepFixture;
}): TaskPipelineInfo => {
  const onlyStep = `${id}-step-0`;
  return {
    id,
    type: "pipeline",
    pipelineType,
    pipelineDetails: {
      id,
      type: pipelineType,
      queuedTime: new Date(Date.now() - 5 * 60_000),
      dfContent: content,
      mediaFormat: "h264",
      stepOrder: [onlyStep],
      steps: { [onlyStep]: { id: onlyStep, name: stepName } },
    },
    pipelineStatus: {
      currentStep: onlyStep,
      statusMessage,
      isComplete: false,
    },
    stepTasks: {
      [onlyStep]: {
        id: onlyStep,
        type: "task",
        taskType,
        capabilities: (step.capabilities ?? []) as BasicTaskInfo["capabilities"],
        priority: 0,
        position: step.position ?? 0,
        priorityPosition: step.position ?? 0,
        startTime: step.startedSecondsAgo ? new Date(Date.now() - step.startedSecondsAgo * 1000) : undefined,
        status: {
          state: step.state,
          isComplete: false,
          attempt: step.attempt ?? 1,
          message: step.message,
          held: step.pauseTrigger === "manual" && step.state === "paused" ? true : undefined,
          pauseTrigger: step.pauseTrigger,
          progress: step.progress,
        },
      } as BasicTaskInfo,
    },
  };
};

/** Marks every step before `upTo` done, so scenarios only spell out what's interesting. */
const completedStepsBefore = (upTo: number, skip: number[] = []): StepFixtures => {
  const steps: StepFixtures = {};
  for (let index = 0; index < upTo; index++) {
    if (skip.includes(index)) {
      continue;
    }
    steps[index] = { state: "success", message: "Done", isComplete: true };
  }
  return steps;
};

const emptyTasks = (): TasksResponse => ({ taskPipelines: [], tasks: [], scheduledDownloads: [] });

/**
 * `tick` advances once per runner interval (see fixture-runner). A scenario
 * that ignores it renders a frozen state; one that uses it animates.
 */
export type ScenarioBuilder = (tick: number) => TasksResponse;

export type FixtureScenario = {
  id: string;
  label: string;
  description: string;
  /** True if the scenario renders differently from one tick to the next. */
  animated: boolean;
  build: ScenarioBuilder;
};

/** Loops 0-100 so progress can be watched moving rather than sitting still. */
const cyclePercent = (tick: number, perTick: number, offset = 0) => (offset + tick * perTick) % 100;

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const scenarios: FixtureScenario[] = [
  {
    id: "downloading",
    label: "Downloading (live)",
    description: "One download in flight, with percentage, bytes, speed and ETA all moving.",
    animated: true,
    build: (tick) => {
      const percent = cyclePercent(tick, 0.9, 12);
      const totalBytes = 6 * GIB;
      // A little wobble, so the speed readout behaves like a real connection
      // rather than sitting on a constant nobody would ever actually see.
      const speed = (22 + Math.sin(tick / 4) * 6) * 1024 * 1024;
      return {
        taskPipelines: [
          makePipeline({
            id: "fixture-downloading",
            content: CONTENT.direct,
            mediaFormat: "HEVC",
            currentStep: STEP.download,
            statusMessage: "Downloading",
            steps: {
              [STEP.download]: {
                state: "running",
                message: "Downloading",
                startedSecondsAgo: 90,
                download: {
                  percentComplete: percent,
                  totalBytes,
                  totalBytesDownloaded: (percent / 100) * totalBytes,
                  currentBytesPerSecond: speed,
                },
              },
            },
          }),
        ],
        tasks: [],
        scheduledDownloads: [],
      };
    },
  },
  {
    id: "post-processing",
    label: "Post-processing (subtitles)",
    description:
      "Download done, subtitle generation part-way through - the long step that used to show no progress at all.",
    animated: true,
    build: (tick) => {
      const percent = cyclePercent(tick, 0.4, 30);
      const totalSeconds = 11 * 60;
      return {
        taskPipelines: [
          makePipeline({
            id: "fixture-post-processing",
            content: CONTENT.retro,
            currentStep: STEP.generateSubtitles,
            statusMessage: "Generating subtitles",
            steps: {
              ...completedStepsBefore(STEP.generateSubtitles),
              [STEP.generateSubtitles]: {
                state: "running",
                message: "Transcribing audio",
                // Started long enough ago that the ETA estimate, which
                // extrapolates from elapsed time, has something to work with.
                startedSecondsAgo: 240,
                progress: {
                  percent,
                  detail: `${mmss(Math.round((percent / 100) * totalSeconds))} / ${mmss(totalSeconds)}`,
                },
              },
            },
          }),
        ],
        tasks: [],
        scheduledDownloads: [],
      };
    },
  },
  {
    id: "failed",
    label: "Failed at step 5 (metadata)",
    description:
      "Died in Inject Metadata, with Generate Subtitles skipped earlier - the skipped-step render is the easy one to get wrong.",
    animated: false,
    build: () => ({
      taskPipelines: [
        makePipeline({
          id: "fixture-failed",
          content: CONTENT.stutters,
          mediaFormat: "HEVC",
          currentStep: STEP.injectMetadata,
          isComplete: true,
          pipelineResult: "failed",
          statusMessage: "Failed while injecting metadata",
          steps: {
            // Generate Subtitles is left out on purpose - see StepFixtures.
            ...completedStepsBefore(STEP.injectMetadata, [STEP.generateSubtitles]),
            [STEP.injectMetadata]: {
              state: "failed",
              message: "ffmpeg exited with code 1",
              error: "ffmpeg exited with code 1: Invalid data found when processing input",
              isComplete: true,
              attempt: 3,
              startedSecondsAgo: 60,
            },
          },
        }),
      ],
      tasks: [],
      scheduledDownloads: [],
    }),
  },
  {
    id: "cancelled",
    label: "Cancelled mid-download",
    description: "Cancelled by hand while downloading, with every later step never reached.",
    animated: false,
    build: () => ({
      taskPipelines: [
        makePipeline({
          id: "fixture-cancelled",
          content: CONTENT.techReview,
          currentStep: STEP.download,
          isComplete: true,
          pipelineResult: "cancelled",
          statusMessage: "Cancelled",
          steps: {
            [STEP.download]: {
              state: "cancelled",
              message: "Cancelled by user",
              isComplete: true,
              startedSecondsAgo: 120,
              download: {
                percentComplete: 41.7,
                totalBytesDownloaded: 0.417 * 6 * GIB,
                currentBytesPerSecond: 0,
              },
            },
          },
        }),
      ],
      tasks: [],
      scheduledDownloads: [],
    }),
  },
  {
    id: "not-applicable-steps",
    label: "Steps that will not run",
    description:
      "Default settings: subtitles are embedded, so Write Subtitles never runs. Dimmed with its reason in the details dialog, absent from the card.",
    animated: false,
    build: () => ({
      taskPipelines: [
        makePipeline({
          id: "fixture-not-applicable",
          content: CONTENT.stutters,
          currentStep: STEP.download,
          statusMessage: "Downloading",
          // Exactly what getDownloadStepNotApplicableReasons returns for the
          // default configuration - auto output, during_download, no keep
          // transcript.
          notApplicable: {
            [STEP.writeSubtitles]:
              'Subtitles are embedded in the video rather than written alongside it - turn on "keep transcript" to get both',
          },
          steps: {
            [STEP.download]: {
              state: "running",
              message: "Downloading",
              position: 0,
              startedSecondsAgo: 140,
              activeSecondsSoFar: 140,
              download: { percentComplete: 41.8, totalBytesDownloaded: 0.418 * 6 * GIB },
            },
          },
        }),
      ],
      tasks: [],
      scheduledDownloads: [],
    }),
  },
  {
    id: "paused-and-retrying",
    label: "Paused + awaiting retry",
    description: "One download paused by hand, one backing off between retries, one force-started.",
    animated: false,
    build: () => ({
      taskPipelines: [
        makePipeline({
          id: "fixture-paused",
          content: CONTENT.direct,
          currentStep: STEP.download,
          statusMessage: "Paused",
          steps: {
            [STEP.download]: {
              state: "paused",
              message: "Paused",
              pauseTrigger: "manual",
              position: 0,
              // Elapsed 5m, Active 2m14s - deliberately divergent, so the
              // paused row shows both numbers and the difference explains
              // itself. Equal values would render only Elapsed.
              startedSecondsAgo: 300,
              activeSecondsSoFar: 134,
              download: {
                percentComplete: 63.2,
                totalBytesDownloaded: 0.632 * 6 * GIB,
                // Zero, as the real thing reports within a few seconds of a
                // pause - samples older than 3s are ignored. This is the exact
                // input that used to produce "about 641286h remaining", so the
                // fixture reproduces that bug rather than just describing it.
                currentBytesPerSecond: 0,
              },
            },
          },
        }),
        makePipeline({
          id: "fixture-retrying",
          content: CONTENT.retrospective,
          currentStep: STEP.download,
          statusMessage: "Awaiting retry",
          steps: {
            [STEP.download]: {
              state: "awaiting_retry",
              message: "Connection reset, retrying in 30s",
              attempt: 4,
              position: 1,
              startedSecondsAgo: 200,
              download: {
                percentComplete: 8.4,
                totalBytesDownloaded: 0.084 * 6 * GIB,
                currentBytesPerSecond: 0,
                retries: 3,
              },
            },
          },
        }),
        makePipeline({
          id: "fixture-forced",
          content: CONTENT.stutters,
          currentStep: STEP.download,
          statusMessage: "Downloading (force started)",
          steps: {
            [STEP.download]: {
              state: "running",
              message: "Downloading",
              forceStarted: true,
              position: 2,
              startedSecondsAgo: 30,
              download: {
                percentComplete: 27.9,
                totalBytesDownloaded: 0.279 * 6 * GIB,
              },
            },
          },
        }),
      ],
      tasks: [],
      scheduledDownloads: [],
    }),
  },
  {
    id: "mixed-lanes",
    label: "Mixed lanes",
    description:
      "A download, a transcription that cannot be interrupted, and two analyses - all running at once, behind a queue of fourteen transcriptions. The case the lanes exist for: the analyses hold the highest queue positions, so one flat list ordered by position buries them under the backlog.",
    animated: true,
    build: (tick) => {
      const contents = Object.values(CONTENT);
      const percent = cyclePercent(tick, 0.6, 0);
      const totalBytes = 5 * GIB;
      const downloading = makePipeline({
        id: "fixture-lane-download",
        content: contents[0],
        currentStep: STEP.download,
        statusMessage: "Downloading",
        steps: {
          [STEP.download]: {
            state: "running",
            message: "Downloading",
            position: 0,
            startedSecondsAgo: 120,
            download: {
              percentComplete: percent,
              totalBytes,
              totalBytesDownloaded: (percent / 100) * totalBytes,
              currentBytesPerSecond: 22 * 1024 * 1024,
            },
          },
        },
      });
      // Declares no capabilities, like the real transcription task: it cannot
      // be paused, so it must not be draggable out of the running slot.
      const transcribing = makeLanePipeline({
        id: "fixture-lane-subs-running",
        pipelineType: "subtitles",
        stepName: "Generate Subtitles",
        taskType: "subtitles",
        content: contents[1],
        statusMessage: "Transcribing",
        step: {
          state: "running",
          message: "Transcribing",
          position: 0,
          startedSecondsAgo: 400,
          capabilities: [],
          progress: { percent: cyclePercent(tick, 0.3, 12), detail: "Transcribing audio" },
        },
      });
      const subsQueue = Array.from({ length: 14 }, (_unused, index) =>
        makeLanePipeline({
          id: `fixture-lane-subs-${index}`,
          pipelineType: "subtitles",
          stepName: "Generate Subtitles",
          taskType: "subtitles",
          content: contents[(index + 2) % contents.length],
          statusMessage: "Waiting to transcribe",
          step: { state: "idle", message: "Queued", position: index + 1, capabilities: [] },
        })
      );
      // Deliberately the highest positions in the whole queue - these are the
      // rows that used to sit below all fourteen above despite running.
      const analysing = [0, 1].map((index) =>
        makeLanePipeline({
          id: `fixture-lane-ai-running-${index}`,
          pipelineType: "ai_analysis",
          stepName: "Analyse Content",
          taskType: "ai_analysis",
          content: contents[(index + 3) % contents.length],
          statusMessage: "Analysing",
          step: {
            state: "running",
            message: "Analysing",
            position: 20 + index,
            startedSecondsAgo: 40 + index * 15,
            capabilities: [],
            progress: { percent: cyclePercent(tick, 0.9, index * 30), detail: "Reading transcript" },
          },
        })
      );
      const analysisQueue = [0, 1].map((index) =>
        makeLanePipeline({
          id: `fixture-lane-ai-queued-${index}`,
          pipelineType: "ai_analysis",
          stepName: "Analyse Content",
          taskType: "ai_analysis",
          content: contents[(index + 1) % contents.length],
          statusMessage: "Waiting to analyse",
          step: { state: "idle", message: "Queued", position: 22 + index, capabilities: [] },
        })
      );
      return {
        taskPipelines: [downloading, transcribing, ...subsQueue, ...analysing, ...analysisQueue],
        tasks: [],
        scheduledDownloads: [],
      };
    },
  },
  {
    id: "long-queue",
    label: "Long queue",
    description:
      "Two downloads running, six queued behind them, two finished, two still waiting out their auto-download delay.",
    animated: true,
    build: (tick) => {
      const contents = Object.values(CONTENT);
      const running = [0, 1].map((index) => {
        const percent = cyclePercent(tick, index === 0 ? 0.8 : 0.35, index * 40);
        const totalBytes = (4 + index * 3) * GIB;
        return makePipeline({
          id: `fixture-queue-running-${index}`,
          content: contents[index % contents.length],
          mediaFormat: index % 2 ? "HEVC" : "h264",
          currentStep: STEP.download,
          statusMessage: "Downloading",
          steps: {
            [STEP.download]: {
              state: "running",
              message: "Downloading",
              position: index,
              startedSecondsAgo: 60 + index * 30,
              download: {
                percentComplete: percent,
                totalBytes,
                totalBytesDownloaded: (percent / 100) * totalBytes,
                currentBytesPerSecond: (18 + Math.sin(tick / 3 + index) * 5) * 1024 * 1024,
              },
            },
          },
        });
      });
      const queued = Array.from({ length: 6 }, (_unused, index) =>
        makePipeline({
          id: `fixture-queue-idle-${index}`,
          content: contents[(index + 2) % contents.length],
          mediaFormat: index % 2 ? "HEVC" : "h264",
          currentStep: STEP.download,
          statusMessage: "Queued",
          steps: {
            [STEP.download]: {
              state: "idle",
              message: "Queued",
              position: index + 2,
              download: { percentComplete: 0, totalBytesDownloaded: 0, currentBytesPerSecond: 0 },
            },
          },
        })
      );
      const done = [0, 1].map((index) =>
        makePipeline({
          id: `fixture-queue-done-${index}`,
          content: contents[(index + 1) % contents.length],
          currentStep: STEP.writeSubtitles,
          isComplete: true,
          pipelineResult: "success",
          statusMessage: "Downloaded to /fixtures",
          steps: {
            ...completedStepsBefore(STEP.writeSubtitles),
            [STEP.writeSubtitles]: { state: "success", message: "Written", isComplete: true },
          },
        })
      );
      const scheduledDownloads: ScheduledDownloadInfo[] = [
        {
          contentKey: CONTENT.techReview.key,
          title: CONTENT.techReview.title,
          scheduledFor: new Date(Date.now() + 7 * 60_000),
        },
        {
          contentKey: CONTENT.retrospective.key,
          title: CONTENT.retrospective.title,
          scheduledFor: new Date(Date.now() + 23 * 60_000),
        },
      ];
      return { taskPipelines: [...running, ...queued, ...done], tasks: [], scheduledDownloads };
    },
  },
  {
    id: "empty",
    label: "Empty",
    description: "Nothing queued, running or finished - the page's empty state.",
    animated: false,
    build: emptyTasks,
  },
];

export const FIXTURE_SCENARIOS = scenarios;
export const getScenario = (id: string) => scenarios.find((scenario) => scenario.id === id);
export const emptyTasksResponse = emptyTasks;
