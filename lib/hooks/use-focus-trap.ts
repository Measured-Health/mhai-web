"use client";
import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * While `active`: moves focus into `ref`, wraps Tab / Shift+Tab inside it, and restores
 * focus to the previously focused element on close. If nothing inside is focusable the
 * panel itself is focused (give it `tabIndex={-1}`).
 */
export function useFocusTrap(
  active: boolean,
  ref: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const panel = ref.current;
    if (!active || !panel) return;
    const prev = document.activeElement as HTMLElement | null;
    const items = () => [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
    (items()[0] ?? panel).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = items();
      if (els.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || cur === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.contains(cur)) {
        e.preventDefault();
        first.focus();
      }
    };
    // Document level so Tab from outside the panel is also pulled back in.
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [active, ref]);
}
