import {
  ScheduledBackfillEndReason,
  ScheduledBackfillStatus,
  logger,
  makeErrorMessage,
} from "df-downloader-common";
import {
  AiAnalysisConfig,
  AiAnalysisConfigUtils,
  AiProviderId,
  ScheduledBackfillConfig,
} from "df-downloader-common/config/ai-analysis-config.js";
import { configService } from "../config/config.js";
import { ScheduledBackfillHistory } from "../db/scheduled-backfill-history.js";
import { DfTaskManager } from "../df-task-manager.js";
import { serviceLocator } from "./service-locator.js";
import { ensureArticleForContent } from "../utils/df-articles/ensure-article.js";
import { surveyEligibleContent } from "../utils/schedule/backfill-eligibility.js";
import { BackfillWindow, evaluateBackfillWindow } from "../utils/schedule/backfill-window.js";

/**
 * How often the feeder looks at the clock and the queue.
 *
 * A minute is plenty and deliberately unconfigurable. Nothing here is
 * latency-sensitive: the unit of work is tens of minutes of local inference,
 * so being up to a minute late to notice a free queue is noise against it, and
 * a knob for it would be a knob nobody could set well.
 */
const TICK_MS = 60_000;

/**
 * Keeps feeding eligible content into AI analysis while a window is open.
 *
 * Three properties hold this together, and each of them is load-bearing rather
 * than incidental:
 *
 * **The window gates this feeder, not the queue.** The local models queue runs
 * normally at all hours. Outside the window nothing here adds to it; inside,
 * it tops it up. Implementing this by holding the queue instead would look
 * equivalent and is not - a held queue starts *nothing*, so a download
 * finishing at 6am would have its subtitle step blocked until midnight, and no
 * amount of priority could rescue it because nothing would be being scheduled
 * at all. It would also overload the flag "pause all" already uses.
 *
 * **One item at a time, because the window controls when work starts and not
 * when it stops.** Whatever is queued when the window closes still runs to
 * completion - killing tens of minutes of local inference at a clock boundary
 * would waste all of it - so a batch queued at 04:59 overruns by the length of
 * the whole batch, while feeding singly bounds the overrun to one item. That
 * is the reason, and close to the only one. It is explicitly *not* that a full
 * queue would block other work: fed runs sit at BACKGROUND_TASK_PRIORITY,
 * below both standalone and pipeline work, so a queue full of them delays
 * nothing anyone asked for. Priority solves that; single feeding solves
 * overrun.
 *
 * **It waits for the queue to be free rather than pacing against a clock**,
 * which makes it self-limiting and machine-adaptive with nothing to configure.
 * A fast box gets through more per window, a slow one fewer, and neither needs
 * telling how long an analysis takes.
 */
export class ScheduledAnalysisBackfill {
  private timer?: NodeJS.Timeout;
  /** Identifies the window currently open, so opening and closing are detectable transitions. */
  private openWindowKey?: string;
  private fedThisWindow = 0;
  private analysedThisWindow = 0;
  private failedThisWindow = 0;
  /** Updated as the window runs, so closing it can say why it stopped. */
  private endReason: ScheduledBackfillEndReason = "closed";
  /** Ticks are async and the timer is not; this stops two overlapping. */
  private ticking = false;

  static async create(taskManager: DfTaskManager, dbDir: string) {
    const history = await ScheduledBackfillHistory.create(dbDir);
    return new ScheduledAnalysisBackfill(taskManager, history);
  }

  private constructor(
    private readonly taskManager: DfTaskManager,
    private readonly history: ScheduledBackfillHistory
  ) {}

  start() {
    /*
     * A window left open in the history means the service stopped part-way
     * through one. Closed as interrupted rather than continued: the counts
     * belong to a process that is gone, and folding tonight's work into
     * yesterday's row would make both unreadable.
     */
    if (this.history.openWindow()) {
      this.history.close("interrupted", undefined);
    }
    // No initial catch-up run. Unlike the content poll loop there is nothing
    // time-sensitive to miss - if a window is open, the first tick a minute
    // from now is inside it just the same.
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    logger.log("debug", "Scheduled AI backfill feeder armed");
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** The saved schedule, or undefined when the feature is off or unconfigured. */
  private activeConfig(): { ai: AiAnalysisConfig; backfill: ScheduledBackfillConfig } | undefined {
    const ai = configService.config.aiAnalysis;
    const backfill = ai?.scheduledBackfill;
    if (!ai || !backfill?.enabled) {
      return undefined;
    }
    return { ai, backfill };
  }

  private async tick() {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      await this.runTick();
    } catch (e) {
      logger.log("error", "Scheduled AI backfill tick failed", e);
    } finally {
      this.ticking = false;
    }
  }

  private async runTick() {
    const active = this.activeConfig();
    if (!active) {
      // Turned off mid-window counts as an interruption, not a close: the
      // window did not end, someone ended it.
      this.closeOpenWindow("interrupted");
      return;
    }
    const { ai, backfill } = active;

    /*
     * Checked every tick rather than once at startup. A schedule switched on
     * with no engine behind it does nothing, silently, forever - and silently
     * doing nothing is exactly what a working scheduled feature looks like, so
     * this is logged loudly enough to be findable rather than left to the
     * settings panel alone.
     */
    if (!AiAnalysisConfigUtils.isUsable(ai)) {
      this.closeOpenWindow("interrupted");
      return;
    }

    const now = new Date();
    const evaluation = evaluateBackfillWindow(backfill.schedule, backfill.endTime, now);
    if (evaluation.error) {
      // Logged once per tick would be a minute-by-minute stream, but the
      // alternative - staying quiet - is a typo silently meaning "never".
      // The settings panel is the primary place this is said; this is the
      // backstop for someone reading logs and wondering why nothing ran.
      logger.log("warn", `Scheduled AI backfill cannot read its schedule: ${evaluation.error}`);
      this.closeOpenWindow("interrupted");
      return;
    }

    if (!evaluation.open || !evaluation.window) {
      this.closeOpenWindow(this.endReason);
      return;
    }

    this.ensureWindowOpen(evaluation.window, ai);

    if (backfill.maxPerWindow !== undefined && this.fedThisWindow >= backfill.maxPerWindow) {
      this.endReason = "cap_reached";
      return;
    }

    // One in flight is the whole point - see the class comment. Queued counts
    // as in flight, since queued work still runs after the window closes.
    if (this.taskManager.countScheduledAnalyses() > 0) {
      return;
    }

    const { provider } = AiAnalysisConfigUtils.resolveScheduledProvider(ai);
    if (!provider) {
      return;
    }
    /*
     * "Pause all" holds every queue, and it means the user wants nothing new
     * starting. Feeding into a held queue would build a backlog that all
     * begins at once when the hold lifts - the opposite of what pausing is
     * for.
     */
    if (this.taskManager.isScheduledAnalysisQueueHeld(provider)) {
      return;
    }

    const survey = await surveyEligibleContent(serviceLocator.db, backfill.eligibility, now);
    const next = survey.items[0];
    if (!next) {
      this.endReason = "ran_dry";
      return;
    }

    await this.feed(next.key, ai, provider);
    // Only reset once something was actually fed - otherwise a window that ran
    // dry and then had one item become eligible would keep the stale reason.
    this.endReason = "closed";
  }

  /**
   * Queues exactly one analysis.
   *
   * Mirrors the content manager's own startAnalysisForContent rather than
   * reimplementing it: the article is looked up first because it is written
   * text, so its product names and figures are right where a machine
   * transcript's may not be, and it is worth a few seconds to have it in hand.
   */
  private async feed(contentKey: string, ai: AiAnalysisConfig, provider: AiProviderId) {
    const entry = await serviceLocator.db.getContentEntry(contentKey);
    if (!entry) {
      return;
    }
    const article = ai.sources.article
      ? await ensureArticleForContent(serviceLocator.db, entry.contentInfo).catch(() => undefined)
      : undefined;

    const execution = this.taskManager.analyseContent(entry, ai, {
      articleText: article?.text,
      articleUrl: article?.url,
      articleTitle: article?.title,
      provider,
      scheduled: true,
    });

    this.fedThisWindow++;
    this.history.recordFed(contentKey, entry.contentInfo.title);
    logger.log(
      "info",
      `Scheduled AI backfill queued "${entry.contentInfo.title}" (${this.fedThisWindow} this window)`
    );

    /*
     * Counted on completion rather than at queue time, because "18 analysed,
     * 1 failed" is the whole substance of the history row. Attaching after the
     * pipeline may already have finished is safe - executions replay their
     * event cache to new listeners.
     */
    execution.on("completed", (result: { status?: string } | undefined) => {
      const succeeded = result?.status === "success";
      if (succeeded) {
        this.analysedThisWindow++;
      } else {
        this.failedThisWindow++;
      }
      this.history.recordOutcome(succeeded);
    });
  }

  private ensureWindowOpen(window: BackfillWindow, ai: AiAnalysisConfig) {
    const key = window.opensAt.toISOString();
    if (this.openWindowKey === key) {
      return;
    }
    // A different window than the one being tracked means the previous one
    // ended without a tick landing outside it - close it before opening this.
    this.closeOpenWindow(this.endReason);

    const { provider, requested, fellBack } = AiAnalysisConfigUtils.resolveScheduledProvider(ai);
    if (fellBack) {
      /*
       * Said out loud rather than discovered from a bill. The fallback itself
       * matches every other unattended path here - an overnight backfill
       * stopping because the preferred engine was switched off is worse than
       * it running on the other one - but "I set this to run on this machine"
       * and "it has been running on the API" is exactly the surprise worth
       * logging at warn.
       */
      logger.log(
        "warn",
        `Scheduled AI backfill is configured for ${requested} but that engine is unavailable - running on ${provider} instead`
      );
    }
    this.openWindowKey = key;
    this.fedThisWindow = 0;
    this.analysedThisWindow = 0;
    this.failedThisWindow = 0;
    this.endReason = "closed";
    this.history.open({
      id: key,
      openedAt: window.opensAt,
      scheduledCloseAt: window.closesAt,
      provider,
    });
    logger.log(
      "info",
      `Scheduled AI backfill window open until ${window.closesAt.toLocaleTimeString()} - new analyses will stop starting then, but one already running will finish`
    );
  }

  private closeOpenWindow(reason: ScheduledBackfillEndReason) {
    if (!this.openWindowKey) {
      return;
    }
    this.openWindowKey = undefined;
    const backfill = configService.config.aiAnalysis?.scheduledBackfill;
    // Best-effort: the remaining count is the useful half of the row, but a
    // failure to compute it must not stop the window being closed.
    const remaining = backfill
      ? surveyEligibleContent(serviceLocator.db, backfill.eligibility)
          .then((survey) => survey.items.length)
          .catch(() => undefined)
      : Promise.resolve(undefined);
    void remaining.then((count) => this.history.close(reason, count));
  }

  /**
   * Everything the settings panel shows, computed against a draft.
   *
   * Takes the unsaved form values rather than reading config, because the
   * eligibility toggles change the eligible count and a preview that only
   * updates on save is a preview of the wrong thing. Follows the provider test
   * button, which posts the on-screen config for the same reason.
   */
  async status(draft?: ScheduledBackfillConfig): Promise<ScheduledBackfillStatus> {
    const ai = configService.config.aiAnalysis;
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || "unknown";
    const usableProviders = AiAnalysisConfigUtils.usableProviders(ai);

    const base = {
      engineConfigured: usableProviders.length > 0,
      usableProviders,
      providerFellBack: false,
      windowOpen: false,
      serverTime: now,
      timeZone,
      eligibleCount: 0,
      analysedThisWindow: this.analysedThisWindow,
      failedThisWindow: this.failedThisWindow,
      inFlight: this.taskManager.countScheduledAnalyses(),
      history: this.history.list(),
    };

    if (!ai || usableProviders.length === 0) {
      return {
        ...base,
        /*
         * The reason for the engine the user is most likely to have meant.
         * Reporting "local analysis is off" to someone who has never enabled
         * analysis at all would send them to the wrong switch, so the
         * feature-level reason wins when it applies.
         */
        engineBlockedReason:
          AiAnalysisConfigUtils.providerUnusableReason(ai, "anthropic") === "AI analysis is turned off"
            ? "AI analysis is turned off"
            : "Analysis needs either an Anthropic API key or a model on this machine, and neither is set up",
      };
    }

    // The draft's provider, evaluated against the *saved* engine setup - which
    // is the honest pairing, since credentials are saved separately from this
    // panel and an unsaved key cannot be used tonight anyway.
    const effective: AiAnalysisConfig = draft ? { ...ai, scheduledBackfill: draft } : ai;
    const backfill = effective.scheduledBackfill;
    const { provider, fellBack } = AiAnalysisConfigUtils.resolveScheduledProvider(effective);

    if (!backfill) {
      return { ...base, provider, providerFellBack: fellBack };
    }

    const evaluation = evaluateBackfillWindow(backfill.schedule, backfill.endTime, now);
    const survey = await surveyEligibleContent(serviceLocator.db, backfill.eligibility, now);

    return {
      ...base,
      provider,
      providerFellBack: fellBack,
      scheduleError: evaluation.error,
      windowOpen: evaluation.open,
      opensAt: evaluation.window?.opensAt,
      closesAt: evaluation.window?.closesAt,
      eligibleCount: survey.items.length,
      emptyReason: survey.emptyReason,
      estimatedCostUsd:
        provider === "anthropic" ? this.estimateWindowCostUsd(effective, survey.items.length) : undefined,
    };
  }

  /**
   * Roughly what a window would cost, for hosted runs only.
   *
   * Averaged from what runs on this model have actually cost rather than
   * predicted from token counts. Predicting would mean a token-counting API
   * call per eligible item just to render a settings panel - dozens of
   * requests, and money spent to find out how much money you might spend.
   *
   * Returns undefined rather than a guess when there is nothing to average.
   * No number at all is honest; a fabricated one is not.
   */
  private estimateWindowCostUsd(config: AiAnalysisConfig, eligibleCount: number): number | undefined {
    if (!eligibleCount) {
      return undefined;
    }
    try {
      const priced = serviceLocator.db
        .getAiCostLog()
        .entries.filter((entry) => entry.model === config.model && typeof entry.costUsd === "number");
      if (!priced.length) {
        return undefined;
      }
      const mean = priced.reduce((total, entry) => total + (entry.costUsd ?? 0), 0) / priced.length;
      return mean * eligibleCount;
    } catch (e) {
      logger.log("debug", `Could not estimate scheduled backfill cost: ${makeErrorMessage(e)}`);
      return undefined;
    }
  }
}
