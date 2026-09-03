import { validateCronExpression } from "df-downloader-common";
import { CronExpressionParser } from "cron-parser";

/**
 * When a backfill window opens and when it stops starting new work.
 *
 * `closesAt` is deliberately not "when it ends": the window governs when an
 * analysis may *start*, and one already running at that instant runs to
 * completion. Killing tens of minutes of local inference at a clock boundary
 * would waste all of it.
 */
export type BackfillWindow = {
  opensAt: Date;
  closesAt: Date;
};

export type BackfillWindowEvaluation = {
  open: boolean;
  /** The window open now, or the next one to open. Absent only when the schedule is unusable. */
  window?: BackfillWindow;
  /** Why the schedule could not be read. A typo must not silently mean "never". */
  error?: string;
};

const END_TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const parseEndTime = (endTime: string) => {
  const match = END_TIME.exec(endTime.trim());
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : undefined;
};

/**
 * The close instant for a window that opened at `opensAt`.
 *
 * Built from local calendar parts and advanced with `setDate`, not by adding
 * 86,400,000ms: on the two days a year the clocks change, a day is 23 or 25
 * hours, and arithmetic on the epoch would put the close an hour out. The
 * whole point of "until 05:00" is that it means 05:00 on the clock.
 *
 * An end time at or before the start time means the next day, which is the
 * ordinary case rather than the exception - 22:00 until 02:00 is what this
 * feature exists for. Equal times therefore mean a full 24 hours, which is
 * the only reading that is not either zero-length or arbitrary.
 */
const closeFor = (opensAt: Date, endHour: number, endMinute: number): Date => {
  const closesAt = new Date(
    opensAt.getFullYear(),
    opensAt.getMonth(),
    opensAt.getDate(),
    endHour,
    endMinute,
    0,
    0
  );
  if (closesAt.getTime() <= opensAt.getTime()) {
    closesAt.setDate(closesAt.getDate() + 1);
  }
  return closesAt;
};

/**
 * cron-parser treats the current instant as neither past nor future.
 *
 * Asked at exactly 22:00 about `0 22 * * *`, `prev()` returns *yesterday's*
 * 22:00 and `next()` returns tomorrow's - today's fire falls through the gap
 * in both directions. Looking backwards from a second later closes it, so a
 * window whose opening instant lands exactly on a feeder tick is seen as open
 * rather than skipped until the following tick.
 */
const PREV_LOOKBACK_NUDGE_MS = 1000;

/**
 * Is the window open, and when does it next open and close?
 *
 * A window cannot be one cron expression - cron describes instants, not
 * ranges - so this pairs the expression (when it opens) with an end time
 * (when it stops starting work).
 *
 * `now` is injectable so this can be tested across midnight and across a DST
 * change without waiting for either.
 */
export const evaluateBackfillWindow = (
  schedule: string,
  endTime: string,
  now: Date = new Date()
): BackfillWindowEvaluation => {
  // Our own check first: cron-parser's messages name no field, and it accepts
  // a four-field expression outright - see validateCronExpression.
  const syntaxError = validateCronExpression(schedule);
  if (syntaxError) {
    return { open: false, error: syntaxError };
  }
  const end = parseEndTime(endTime);
  if (!end) {
    return { open: false, error: `"${endTime}" is not a time of day - use something like 05:00` };
  }

  let previousOpen: Date | undefined;
  try {
    previousOpen = CronExpressionParser.parse(schedule, {
      currentDate: new Date(now.getTime() + PREV_LOOKBACK_NUDGE_MS),
    })
      .prev()
      .toDate();
  } catch {
    // No previous occurrence within the expression's range. Not an error -
    // a schedule can legitimately never have fired yet.
    previousOpen = undefined;
  }

  if (previousOpen) {
    const closesAt = closeFor(previousOpen, end.hour, end.minute);
    if (now.getTime() >= previousOpen.getTime() && now.getTime() < closesAt.getTime()) {
      return { open: true, window: { opensAt: previousOpen, closesAt } };
    }
  }

  // A fresh parse rather than reusing the iterator above: prev() has already
  // moved its cursor, so next() on it would answer about the wrong instant.
  try {
    const nextOpen = CronExpressionParser.parse(schedule, { currentDate: now }).next().toDate();
    return { open: false, window: { opensAt: nextOpen, closesAt: closeFor(nextOpen, end.hour, end.minute) } };
  } catch {
    return { open: false, error: "This schedule never runs - check the day and month" };
  }
};

/**
 * How long the window lasts, in minutes, for the "- 5 hours" line beside the
 * times.
 *
 * Measured on a reference day rather than in the abstract, because on a clock
 * change the answer genuinely differs - which is a fact about that night, not
 * a reason to report the wrong number on every other one.
 */
export const backfillWindowLengthMinutes = (window: BackfillWindow): number =>
  Math.round((window.closesAt.getTime() - window.opensAt.getTime()) / 60_000);
