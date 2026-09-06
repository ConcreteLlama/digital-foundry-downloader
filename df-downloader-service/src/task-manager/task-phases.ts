import { TaskOutputField, TaskPhase } from "df-downloader-common";

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

  /**
   * Replaces one phase's detail, running or finished.
   *
   * What a phase produced is worth more than what it was doing: while it runs
   * the detail is progress ("29 tokens written"), and once it is done that
   * number is spent, where the outcome - what it decided - is the thing
   * anyone actually wants to see next to it.
   *
   * Named by phase rather than assuming the current one, since an outcome is
   * usually reported just after moving on.
   */
  setDetail(name: string, detail: string) {
    const index = this.phases.findIndex((phase) => phase.name === name);
    if (index !== -1) {
      this.phases[index] = { ...this.phases[index], detail };
    }
  }

  /**
   * Records what a phase produced, for anyone drilling into it.
   *
   * Truncated here rather than trusting the caller, because this ends up in
   * every status push - see TaskPhase.output.
   */
  setOutput(name: string, output: TaskOutputField[], maxValueChars = 2000) {
    const index = this.phases.findIndex((phase) => phase.name === name);
    if (index === -1) {
      return;
    }
    this.phases[index] = {
      ...this.phases[index],
      // Truncated here rather than trusting the caller, because every one of
      // these is pushed to every client on every status change.
      output: output.map((field) => ({
        ...field,
        value:
          field.value.length > maxValueChars
            ? `${field.value.slice(0, maxValueChars)}… (${field.value.length} characters in total)`
            : field.value,
      })),
    };
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
