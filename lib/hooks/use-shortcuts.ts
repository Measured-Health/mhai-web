"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** A palette, dialog or drawer is open: plain-letter shortcuts must not act behind it. */
const modalOpen = () =>
  [...document.querySelectorAll('dialog[open], [aria-modal="true"]')].some(
    // A closed drawer stays mounted but is inert / hidden.
    (el) => !el.closest('[inert], [aria-hidden="true"]'),
  );

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
      if (e.isComposing || e.altKey || e.repeat || e.defaultPrevented) return;
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      const combo = `${mod ? "mod+" : ""}${e.shiftKey && k.length === 1 && k !== "?" ? "shift+" : ""}${k}`;
      const fn = ref.current[combo];
      if (!fn) return;
      if (!mod && (typing(e.target) || modalOpen())) return;
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
