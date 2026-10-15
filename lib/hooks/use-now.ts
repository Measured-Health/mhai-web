"use client";
import { useEffect, useState } from "react";

/** Current time as state, refreshed every `intervalMs`. Keeps render pure (no Date.now() in render). */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
