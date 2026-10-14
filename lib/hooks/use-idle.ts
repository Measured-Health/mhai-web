"use client";
import { useEffect, useEffectEvent } from "react";

const ACTIVITY = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

/** Calls `onIdle` once `ms` pass with no pointer, key, scroll or touch activity. */
export function useIdle(ms: number, onIdle: () => void) {
  // Always calls the latest `onIdle` without restarting the timer.
  const fire = useEffectEvent(() => onIdle());
  useEffect(() => {
    let t = setTimeout(() => fire(), ms);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => fire(), ms);
    };
    ACTIVITY.forEach((e) =>
      window.addEventListener(e, reset, { passive: true }),
    );
    return () => {
      clearTimeout(t);
      ACTIVITY.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [ms]);
}
