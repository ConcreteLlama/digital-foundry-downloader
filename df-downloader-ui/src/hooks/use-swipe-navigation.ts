import { useRef } from "react";

/**
 * Left/right swipe as a way of moving between sibling views.
 *
 * Hand-rolled rather than pulled from a library: the behaviour is a
 * threshold and two guards, and the usual dependency for this is
 * unmaintained.
 *
 * The guards are the substance, and both exist because a horizontal drag
 * is ambiguous on a touch screen:
 *
 * - A drag that is mostly vertical is the page being scrolled, and must
 *   not navigate.
 * - A drag that starts inside something which can itself scroll sideways -
 *   a settings table, a wide row of formats, a long file path - belongs to
 *   that element. Without this, those become unreadable on a phone,
 *   because every attempt to scroll one navigates away instead.
 *
 * Spread the returned props onto the element the gesture applies to, and
 * give it the returned ref so the second guard knows where to stop
 * looking.
 */

/** Far enough that a swipe is unambiguous rather than a stray drag. */
const SWIPE_THRESHOLD_PX = 60;

/** How much more horizontal than vertical a drag must be to count. */
const HORIZONTAL_BIAS = 1.5;

export type SwipeNavigationOptions = {
  /** Called on a right-to-left swipe - "forward", the way pages advance. */
  onNext?: () => void;
  /** Called on a left-to-right swipe. */
  onPrevious?: () => void;
};

export const useSwipeNavigation = ({ onNext, onPrevious }: SwipeNavigationOptions) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; y: number; locked: boolean } | null>(null);

  const startsInHorizontalScroller = (target: EventTarget | null) => {
    let node = target as HTMLElement | null;
    while (node && node !== ref.current) {
      if (node.scrollWidth > node.clientWidth + 1) {
        const overflowX = window.getComputedStyle(node).overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          return true;
        }
      }
      node = node.parentElement;
    }
    return false;
  };

  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    start.current = {
      x: touch.clientX,
      y: touch.clientY,
      locked: startsInHorizontalScroller(event.target),
    };
  };

  const onTouchEnd = (event: React.TouchEvent) => {
    const from = start.current;
    start.current = null;
    if (!from || from.locked) {
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy) * HORIZONTAL_BIAS) {
      return;
    }
    if (dx < 0) {
      onNext?.();
    } else {
      onPrevious?.();
    }
  };

  return { ref, onTouchStart, onTouchEnd };
};
