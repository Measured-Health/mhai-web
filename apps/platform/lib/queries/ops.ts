"use client";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useOnline } from "@mhai/ui/hooks/use-online";
import { getPlatformClient } from "../api/client";
import { queryKeys } from "./keys";
import { useTabVisible } from "./notifications";

/** How often the Health tab looks again, while it shows and is online. */
export const HEALTH_POLL_MS = 30_000;

export const healthKey = [...queryKeys.ops, "health"] as const;

/**
 * The health reading, raw: `readHealth` decides what it may show. Polls
 * every 30 s only while the tab is showing and online, and the poll is
 * background, so it never extends the session. Coming back to the tab
 * reads again at once; until that arrives the stale rule shows Couldn't
 * check.
 */
export function useHealth() {
  const online = useOnline();
  const visible = useTabVisible();
  const q = useQuery({
    queryKey: healthKey,
    queryFn: () => getPlatformClient().getHealth({ background: true }),
    refetchInterval: visible && online ? HEALTH_POLL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnReconnect: visible,
  });
  const { refetch } = q;
  const was = useRef(visible);
  useEffect(() => {
    if (visible && !was.current && online) void refetch();
    was.current = visible;
  }, [visible, online, refetch]);
  return q;
}

/** Refresh now: a person asked, so it counts as activity (not background). */
export function refreshHealth(qc: QueryClient) {
  return qc
    .fetchQuery({
      queryKey: healthKey,
      queryFn: () => getPlatformClient().getHealth({ background: false }),
      staleTime: 0,
    })
    .catch(() => undefined);
}

export function useRefreshHealth() {
  const qc = useQueryClient();
  return () => refreshHealth(qc);
}
