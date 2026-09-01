import { useEffect, useState } from "react";

/**
 * False for one frame after the tab becomes visible again, so anything with a
 * CSS transition snaps to its current value instead of animating to it.
 *
 * A background tab keeps receiving updates but stops painting, so a progress
 * bar's width property moves on while what is on screen does not. When the tab
 * is revealed, the transition interpolates from the last painted width to the
 * live one - and with several jobs running at once that reads as every bar
 * replaying its progress at high speed, which is exactly what it looks like:
 * work being redone. Reported from a real session with five transcriptions
 * running.
 *
 * Suppressing the transition for a frame makes the reveal a jump cut, which is
 * the truth: that progress already happened while you were looking elsewhere.
 * Normal animation resumes immediately afterwards.
 */
export const useAnimateAfterReveal = (): boolean => {
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      setAnimate(false);
      // Two frames: the first is where React commits the un-animated width,
      // the second is where it is safe to allow transitions again. Restoring
      // after a single frame can land in the same paint and animate anyway.
      const outer = requestAnimationFrame(() => {
        requestAnimationFrame(() => setAnimate(true));
      });
      return () => cancelAnimationFrame(outer);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  return animate;
};
