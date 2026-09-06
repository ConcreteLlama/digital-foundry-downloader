import { useEffect, useState } from "react";

/**
 * Re-renders on an interval, for values derived from the current time.
 *
 * Elapsed and active readouts are computed from `Date.now()` at render, so
 * they are only as fresh as the last render. That is fine for a download,
 * which pushes progress constantly, and wrong for anything that runs quietly:
 * a local analysis can spend ten minutes inside one model call without
 * emitting a single state change, and its elapsed time sat frozen for all of
 * it - which reads as the job having stalled.
 *
 * Only ticks while it is asked to, so a dialog showing a finished pipeline
 * costs nothing.
 */
export const useTickingClock = (active: boolean, intervalMs = 1000) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setTick((tick) => tick + 1), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
};
