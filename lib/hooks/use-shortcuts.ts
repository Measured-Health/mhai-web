"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/**
 * Global key handler. Keys are written like "mod+k", "?", "n", "shift+c"; mod is ⌘ or Ctrl.
 * Ignored during IME composition; everything except mod combos is ignored while typing.
 */
export function useShortcuts(map: Record<string, (e: KeyboardEvent) => void>) {
  const ref = useRef(map);
  useEffect(() => {
    ref.current = map;
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.isComposing || e.altKey) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const combo = `${mod ? "mod+" : ""}${e.shiftKey && k.length === 1 && k !== "?" ? "shift+" : ""}${k}`;
      const fn = ref.current[combo];
      if (!fn) return;
      if (!mod && typing(e.target)) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
}

const noop = () => () => {};
/** "⌘" on Apple platforms, "Ctrl" elsewhere. Server and first render show "Ctrl". */
export function useModLabel(): string {
  const mac = useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad/i.test(navigator.platform),
    () => false,
  );
  return mac ? "⌘" : "Ctrl";
}
