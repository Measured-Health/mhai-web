"use client";
import { useEffect, useState } from "react";
import { useShell } from "../shell/app-shell";
import { DiscardDialog } from "./discard-dialog";

/**
 * While `dirty`, asks before leaving: in-app links (document-level click
 * capture), programmatic `useShell().navigate()` (the shell's navigation
 * guard) and tab close (`beforeunload`). The draft never leaves memory.
 */
export function UnsavedGuard({
  dirty,
  onDiscard,
  title = "Discard this draft?",
  body = "If you leave now, what you typed will be lost.",
}: {
  dirty: boolean;
  /** Runs when the clinician confirms Discard, before navigating. */
  onDiscard?(): void;
  title?: string;
  body?: string;
}) {
  const { navigate, setNavigationGuard } = useShell();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    setNavigationGuard((href) => {
      setPending(href);
      return false;
    });
    const unload = (e: BeforeUnloadEvent) => e.preventDefault();
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (
        !a ||
        (a.target && a.target !== "_self") ||
        a.hasAttribute("download")
      )
        return;
      const href = a.getAttribute("href");
      // Other sites are covered by beforeunload; in-page anchors keep the draft.
      if (!href || href.startsWith("#") || a.origin !== window.location.origin)
        return;
      e.preventDefault();
      e.stopPropagation();
      setPending(href);
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", click, true);
    return () => {
      setNavigationGuard(null);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty, setNavigationGuard]);

  const keep = () => setPending(null);
  const discard = () => {
    if (pending === null) return;
    const href = pending;
    setPending(null);
    // Drop the guard first, or it would block this navigation too.
    setNavigationGuard(null);
    onDiscard?.();
    navigate(href);
  };

  return (
    <DiscardDialog
      open={pending !== null}
      title={title}
      body={body}
      keepLabel="Keep editing"
      discardLabel="Discard"
      onKeep={keep}
      onDiscard={discard}
    />
  );
}
