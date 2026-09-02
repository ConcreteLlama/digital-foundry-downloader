import { logger, LocalComputeStatus } from "df-downloader-common";

/**
 * Stops the two things that saturate this machine from running at once.
 *
 * Transcription and local analysis are both all-cores-flat-out work, and they
 * sit in different task managers - so nothing otherwise prevents a Whisper job
 * and an analysis grinding against each other on a box that has barely enough
 * for one. On the microserver this is deployed to that is the difference
 * between slow and unusable.
 *
 * Not a plain mutex, because that would quietly override anyone who raised
 * `subtitles.maxConcurrent`: transcription is *shared*, so it keeps whatever
 * concurrency it was configured for, while local analysis is *exclusive* and
 * waits for the machine to be its own. Which is the honest reading of "never
 * both at once" - it is analysis that must not overlap transcription, not
 * transcription that must stop overlapping itself.
 *
 * Deliberately process-wide and not configurable. It exists to stop a
 * contention problem that has no upside, and a setting to re-enable it would
 * only ever make things worse.
 */
class LocalComputeGate {
  /** Transcriptions currently running. */
  private shared = 0;
  /** Whether analysis holds the machine. */
  private exclusiveHeld = false;
  /**
   * Analyses waiting for their turn.
   *
   * Load-bearing: without it a steady stream of transcriptions holds the
   * shared lane open forever and an analysis never runs at all. A subtitles
   * backfill over a library is exactly that stream, so this is the difference
   * between "waits its turn" and "silently never happens".
   */
  private exclusiveWaiting = 0;
  private waiters: (() => void)[] = [];

  private async waitUntil(ready: () => boolean) {
    while (!ready()) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  /**
   * Wakes everyone and lets them re-check.
   *
   * A blunt broadcast rather than picking a winner: the queue is a handful of
   * jobs at most, and choosing who goes next would be inventing a scheduling
   * policy where the task managers already have one.
   */
  private wake() {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) {
      resolve();
    }
  }

  /**
   * Who holds the machine right now, for the Activity page.
   *
   * Reported rather than inferred: an analysis blocked here is "running" as
   * far as its task is concerned, so nothing else in the system can tell the
   * difference between waiting for the machine and simply being slow.
   */
  getStatus(): LocalComputeStatus {
    return {
      transcriptionsRunning: this.shared,
      analysisHoldingMachine: this.exclusiveHeld,
      analysesWaiting: this.exclusiveWaiting,
    };
  }

  /** Transcription: runs alongside other transcriptions, never with analysis. */
  async withShared<T>(
    label: string,
    fn: () => Promise<T>,
    /** Fires true when this has to block, false once it has the machine. */
    onWait?: (waiting: boolean) => void
  ): Promise<T> {
    const mustWait = this.exclusiveHeld || this.exclusiveWaiting > 0;
    if (mustWait) {
      logger.log("debug", `${label} waiting for local analysis to finish`);
      onWait?.(true);
    }
    // Queues behind an analysis that is already waiting, rather than
    // overtaking it - see exclusiveWaiting.
    await this.waitUntil(() => !this.exclusiveHeld && this.exclusiveWaiting === 0);
    if (mustWait) {
      onWait?.(false);
    }
    this.shared++;
    try {
      return await fn();
    } finally {
      this.shared--;
      this.wake();
    }
  }

  /** Local analysis: waits for the machine to be entirely its own. */
  async withExclusive<T>(
    label: string,
    fn: () => Promise<T>,
    /**
     * Fires true when this genuinely has to block, and false once the machine
     * is acquired.
     *
     * Without it a waiting analysis is indistinguishable from a slow one: the
     * task is inside a provider call either way, so it reports itself running
     * and sits at no progress for minutes, which reads as a hang rather than
     * as this protection working.
     */
    onWait?: (waiting: boolean) => void
  ): Promise<T> {
    const mustWait = this.exclusiveHeld || this.shared > 0;
    if (mustWait) {
      logger.log("debug", `${label} waiting for ${this.shared} transcription(s) to finish`);
      onWait?.(true);
    }
    this.exclusiveWaiting++;
    try {
      await this.waitUntil(() => !this.exclusiveHeld && this.shared === 0);
    } finally {
      this.exclusiveWaiting--;
      if (mustWait) {
        onWait?.(false);
      }
    }
    this.exclusiveHeld = true;
    try {
      return await fn();
    } finally {
      this.exclusiveHeld = false;
      this.wake();
    }
  }
}

export const localComputeGate = new LocalComputeGate();
