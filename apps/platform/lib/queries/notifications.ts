"use client";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { useOnline } from "@mhai/ui/hooks/use-online";
import { getPlatformClient } from "../api/client";
import {
  NOTIFICATIONS_MAX,
  type Notification,
  type NotificationsOut,
} from "../api/notifications-contract";
import { notificationOk } from "../analytics/read";
import { queryKeys } from "./keys";

/** How often the bell looks for new changes, while the tab is open and online. */
export const POLL_MS = 60_000;

export const notificationsKey = queryKeys.notifications;

function subscribeVisible(fn: () => void) {
  document.addEventListener("visibilitychange", fn);
  return () => document.removeEventListener("visibilitychange", fn);
}
/** True while the tab is showing. Assumes visible on the server. */
export const useTabVisible = () =>
  useSyncExternalStore(
    subscribeVisible,
    () => document.visibilityState === "visible",
    () => true,
  );

/** What the app shows: the count, and the list only if every item reads. */
export type NotificationsState = {
  /** All of this person's unseen, which can be more than `items.length`. */
  unseen: number;
  /** False when the reply is the wrong shape or fails the summary rule. */
  ok: boolean;
  items: Notification[];
};

function read(out: NotificationsOut): NotificationsState {
  const o = out as Partial<NotificationsOut> | null;
  const items = Array.isArray(o?.items) ? (o!.items as unknown[]) : null;
  const unseen =
    typeof o?.unseen === "number" && Number.isInteger(o.unseen) && o.unseen >= 0
      ? o.unseen
      : 0;
  const ok =
    items !== null &&
    items.length <= NOTIFICATIONS_MAX &&
    items.every(notificationOk);
  return { unseen, ok, items: ok ? (items as Notification[]) : [] };
}

/**
 * The bell's data. Polls every minute only while the tab is showing and the
 * browser is online; a failed check keeps the last data (the bell shows the
 * last good count, with no error badge).
 */
export function useNotifications() {
  const online = useOnline();
  const visible = useTabVisible();
  return useQuery({
    queryKey: notificationsKey,
    queryFn: () => getPlatformClient().listNotifications(),
    select: read,
    refetchInterval: visible && online ? POLL_MS : false,
    refetchIntervalInBackground: false,
    // A reconnect while the tab is hidden sends nothing.
    refetchOnReconnect: visible,
  });
}

function seen(qc: QueryClient, ids: string[] | undefined, unseen: number) {
  qc.setQueryData<NotificationsOut>(notificationsKey, (d) =>
    d
      ? {
          unseen,
          items: d.items.map((i) =>
            !ids || ids.includes(i.id) ? { ...i, seen: true } : i,
          ),
        }
      : d,
  );
}

/**
 * Marks the given notifications seen, or all of them with no ids: one
 * Idempotency-Key per call. Seen is this person's own.
 */
export function useMarkSeen() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (ids: string[] | undefined, key) =>
      getPlatformClient().markSeen(ids ? { ids } : {}, {
        idempotencyKey: key,
      }),
    {
      // A poll still in flight must not land after this and bring back the
      // old count.
      onSuccess: (r, ids) => {
        void qc.cancelQueries({ queryKey: notificationsKey });
        seen(qc, ids, r.unseen);
      },
    },
  );
}
