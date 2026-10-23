"use client";
import { useEffect, useState } from "react";
import { STALE_MS } from "./health";

/**
 * Date.now(), so an old reading ages without a fetch. It renders again at the
 * exact instant the reading turns stale, when the tab is shown again and when
 * the connection changes; a 15 s tick stays as a backstop.
 */
export function useNow(updatedAt: string | undefined, everyMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const id = setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [everyMs]);
  useEffect(() => {
    const at = Date.parse(String(updatedAt));
    if (Number.isNaN(at)) return;
    const ms = at + STALE_MS + 1 - Date.now();
    if (ms <= 0) return;
    const id = setTimeout(() => setNow(Date.now()), ms);
    return () => clearTimeout(id);
  }, [updatedAt, now]);
  return now;
}
