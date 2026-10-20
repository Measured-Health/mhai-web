"use client";
import { useCallback, useEffect, useEffectEvent, useRef } from "react";

// Activity restarts the idle period. `scroll` doesn't bubble, so it is caught
// on document in the capture phase (scrolling inside any element counts).
const WINDOW_ACTIVITY = ["pointerdown", "keydown", "wheel", "touchstart"];
// After sleep, a frozen mobile page or a throttled background tab, check the
// clock at once instead of waiting for the next tick.
const WAKE = ["pageshow", "focus"];

/**
 * Calls `onIdle(lastActivityAt)` once `ms` of wall-clock time pass with no
 * pointer, key, wheel, scroll or touch activity. Deadline based, so missed or
 * delayed timer ticks can't postpone it. Activity checks the deadline first,
 * so activity after a stalled clock fires `onIdle` instead of restarting the
 * period (fail closed). Returns `reset()` to restart the period (for example
 * when the clinician confirms they are still there).
 */
export function useIdle(
  ms: number,
  onIdle: (lastActivityAt: number) => void,
  tickMs = 1000,
): () => void {
  // Written only in effects and event handlers, never during render.
  const last = useRef(0);
  const fired = useRef(false);
  const fire = useEffectEvent((at: number) => onIdle(at));

  const reset = useCallback(() => {
    last.current = Date.now();
    fired.current = false;
  }, []);

  useEffect(() => {
    reset();
    const check = () => {
      if (!fired.current && Date.now() - last.current >= ms) {
        fired.current = true;
        fire(last.current);
      }
    };
    // Never let activity restart a period whose deadline has already passed.
    const onActivity = () => {
      check();
      if (!fired.current) reset();
    };
    const opts = { passive: true, capture: true } as const;
    WINDOW_ACTIVITY.forEach((e) =>
      window.addEventListener(e, onActivity, opts),
    );
    document.addEventListener("scroll", onActivity, opts);
    WAKE.forEach((e) => window.addEventListener(e, check));
    document.addEventListener("visibilitychange", check);
    const t = setInterval(check, tickMs);
    return () => {
      clearInterval(t);
      WINDOW_ACTIVITY.forEach((e) =>
        window.removeEventListener(e, onActivity, opts),
      );
      document.removeEventListener("scroll", onActivity, opts);
      WAKE.forEach((e) => window.removeEventListener(e, check));
      document.removeEventListener("visibilitychange", check);
    };
  }, [ms, tickMs, reset]);

  return reset;
}
