"use client";
import { useEffect, useRef } from "react";

/** Calls `onEscape` when Escape is pressed while `active`. Shared by Dialog, Sheet and drawers. */
export function useEscape(active: boolean, onEscape: () => void) {
  const cb = useRef(onEscape);
  useEffect(() => {
    cb.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      cb.current();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [active]);
}
