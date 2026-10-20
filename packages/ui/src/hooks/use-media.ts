"use client";
import { useSyncExternalStore } from "react";

const QUERY = "(min-width: 768px)";
const supported = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function";

function subscribe(fn: () => void) {
  if (!supported()) return () => {};
  const m = window.matchMedia(QUERY);
  m.addEventListener("change", fn);
  return () => m.removeEventListener("change", fn);
}

/** True from the `md` breakpoint; the server and old browsers count as desktop. */
export const useIsDesktop = () =>
  useSyncExternalStore(
    subscribe,
    () => !supported() || window.matchMedia(QUERY).matches,
    () => true,
  );
