import { TaskPhase } from "df-downloader-common";

/**
 * Bookkeeping for a task that works in named parts.
 *
 * Exists so the timings are kept in one place rather than by each task that
 * wants them: which part is running, when each started and finished, and what
 * happened to the ones that were never reached. Every task doing this by hand
 * is how the same off-by-one appears in three places.
 *
 * Nothing here knows what the parts are. A task declares its own names and
 * weights and calls `enter` as it moves between them.
 */
export class TaskPhaseTracker {
  private readonly phases: TaskPhase[];
  private currentIndex = -1;

  constructor(phases: { name: string; weight?: number }[]) {
    this.phases = phases.map(({ name, weight }) => ({ name, weight, state: "pending" }));
  }

  /**
   * Moves to a phase, closing whatever was running.
   *
   * Skipping forward marks the phases passed over as skipped rather than
   * leaving them pending: a run that decides at step two that step three does
   * not apply should say so, not leave a row that looks like it is still to
   * come. Which of them run is often only knowable partway through - whether
   * a video's type supports extraction is decided by the classification call.
   */
  enter(name: string, detail?: string) {
    const index = this.phases.findIndex((phase) => phase.name === name);
    if (index === -1) {
      return;
    }
    const now = new Date();
    if (index === this.currentIndex) {
      // Same phase, new detail - a token count ticking up, typically.
      this.phases[index].detail = detail ?? this.phases[index].detail;
      return;
    }
    for (let i = 0; i < index; i++) {
      if (this.phases[i].state === "running") {
        this.phases[i] = { ...this.phases[i], state: "done", endedAt: now };
      } else if (this.phases[i].state === "pending") {
        this.phases[i] = { ...this.phases[i], state: "skipped" };
      }
    }
    this.phases[index] = { ...this.phases[index], state: "running", startedAt: now, detail };
    this.currentIndex = index;
  }

  /** Updates the running phase's detail without moving on. */
  detail(detail: string) {
    if (this.currentIndex >= 0) {
      this.phases[this.currentIndex] = { ...this.phases[this.currentIndex], detail };
    }
  }

  /**
   * Closes the run.
   *
   * A failure marks the phase that was running as failed and leaves the rest
   * pending - where it got to is the whole point of looking. Success closes
   * the running one and marks anything never reached as skipped.
   */
  finish(outcome: "done" | "failed" = "done") {
    const now = new Date();
    this.phases.forEach((phase, index) => {
      if (phase.state === "running") {
        this.phases[index] = { ...phase, state: outcome, endedAt: now };
      } else if (phase.state === "pending" && outcome === "done") {
        this.phases[index] = { ...phase, state: "skipped" };
      }
    });
    this.currentIndex = -1;
  }

  /** A snapshot for getStatus(). Copied, so a consumer cannot mutate state. */
  snapshot(): TaskPhase[] {
    return this.phases.map((phase) => ({ ...phase }));
  }
}
