"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { getAlertsClient } from "./api/alerts";
import type {
  AlertOut,
  AlertPageOut,
  AlertQuery,
  DismissIn,
  NotificationSettingsOut,
  NotificationSettingsPatchIn,
} from "./api/alerts-contract";
import { ApiError, isAlertHandled } from "./api/errors";
import { useKeyedMutation } from "./keyed-mutation";
import { READ_RETRY, usePollEvery } from "./network";

/** How often new alerts and the count are checked, like decisions (Plan 3). */
export const ALERT_POLL_MS = 30_000;
/** The newest new alerts: what pop-ups and the bell look at. */
export const FEED_SIZE = 20;
/**
 * Every new Critical alert is fetched on each check, following cursors. The
 * cap keeps one check bounded if the backend holds a flood of them: 5 pages
 * is 100 Critical alerts, far more than anyone can act on from a pop-up.
 * Criticals beyond the cap are not in the feed, but the bell count (the
 * unread count) still counts them.
 */
const CRITICAL_MAX_PAGES = 5;
/** Pop-ups stay on until the saved settings say otherwise (R5). */
export const DEFAULT_SETTINGS: NotificationSettingsOut = {
  alert_popups: true,
  correction_popups: true,
};

export type AlertFilter = Omit<AlertQuery, "cursor" | "limit">;

export const NOTIFY_KEYS = {
  alerts: ["alerts"] as const,
  feed: ["alerts", "feed"] as const,
  unread: ["alerts", "unread"] as const,
  lists: ["alerts", "list"] as const,
  list: (f: AlertFilter) => ["alerts", "list", f] as const,
  settings: ["notification-settings"] as const,
};

/** The hospital has no patient alerts yet (404, or 403 for the route): stop asking (R12). */
export const alertsOff = (e: unknown) =>
  e instanceof ApiError && (e.status === 404 || e.status === 403);

/** Milliseconds for sorting; an unreadable time becomes -Infinity, so it goes last. */
const timeOf = (a: AlertOut) => {
  const t = Date.parse(a.created_at);
  return Number.isNaN(t) ? -Infinity : t;
};
/** Newest first; equal or unreadable times fall back to the id, so the order is stable. */
const newestFirst = (x: AlertOut, y: AlertOut) => {
  const tx = timeOf(x);
  const ty = timeOf(y);
  if (tx !== ty) return ty > tx ? 1 : -1;
  return x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
};

/**
 * The first FEED_SIZE new alerts plus every new Critical one, so a Critical
 * can never fall outside the window behind newer, lesser alerts.
 */
async function fetchFeed(): Promise<AlertPageOut> {
  const client = getAlertsClient();
  const criticals = async () => {
    const found: AlertOut[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < CRITICAL_MAX_PAGES; page++) {
      const p = await client.listAlerts({
        status: "new",
        severity: "critical",
        limit: FEED_SIZE,
        ...(cursor ? { cursor } : {}),
      });
      found.push(...p.alerts);
      if (!p.next_cursor || p.alerts.length === 0) break;
      cursor = p.next_cursor;
    }
    return found;
  };
  const [first, critical] = await Promise.all([
    client.listAlerts({ status: "new", limit: FEED_SIZE }),
    criticals(),
  ]);
  const byId = new Map<string, AlertOut>();
  for (const a of [...first.alerts, ...critical]) byId.set(a.id, a);
  // The feed is not pageable: the merged list has no single cursor.
  return {
    ...first,
    alerts: [...byId.values()].sort(newestFirst),
    next_cursor: null,
  };
}

/** New alerts, newest first: the pop-ups and the bell (polled). */
export function useAlertFeed() {
  const every = usePollEvery(ALERT_POLL_MS);
  return useQuery({
    queryKey: NOTIFY_KEYS.feed,
    queryFn: fetchFeed,
    refetchInterval: (q) => (alertsOff(q.state.error) ? false : every),
    ...READ_RETRY,
  });
}

/** New alerts no one has handled (R1); `data` is the count (polled). */
export function useUnreadAlerts() {
  const every = usePollEvery(ALERT_POLL_MS);
  return useQuery({
    queryKey: NOTIFY_KEYS.unread,
    queryFn: () => getAlertsClient().getUnreadCount(),
    select: (d) => d.count,
    refetchInterval: (q) => (alertsOff(q.state.error) ? false : every),
    ...READ_RETRY,
  });
}

/**
 * One filter's alerts, a page at a time. The last filter's list stays on
 * screen while the next loads, so the filters never jump.
 */
export function useAlertList(f: AlertFilter) {
  return useInfiniteQuery({
    queryKey: NOTIFY_KEYS.list(f),
    queryFn: ({ pageParam }) =>
      getAlertsClient().listAlerts({
        ...f,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    placeholderData: keepPreviousData,
    ...READ_RETRY,
  });
}

type Pages = InfiniteData<AlertPageOut, string | null>;

/** The latest copy of an alert into every cached list and the feed, so cards show it at once (R6, R7). */
export function putAlert(
  qc: QueryClient,
  a: Pick<AlertOut, "id"> & Partial<AlertOut>,
): void {
  const patch = (x: AlertOut) => (x.id === a.id ? { ...x, ...a } : x);
  qc.setQueriesData<Pages>(
    { queryKey: NOTIFY_KEYS.lists },
    (d) =>
      d && {
        ...d,
        pages: d.pages.map((p) => ({ ...p, alerts: p.alerts.map(patch) })),
      },
  );
  qc.setQueryData<AlertPageOut>(
    NOTIFY_KEYS.feed,
    (d) => d && { ...d, alerts: d.alerts.map(patch) },
  );
}

const refreshCounts = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: NOTIFY_KEYS.unread }),
    qc.invalidateQueries({ queryKey: NOTIFY_KEYS.feed }),
  ]);

/** Someone else handled it first: show who and when (R7). */
function handledElsewhere(qc: QueryClient, id: string, e: Error) {
  if (isAlertHandled(e)) putAlert(qc, { id, ...e.handled });
}

export function useAcknowledgeAlert() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (id: string, key) =>
      getAlertsClient().acknowledgeAlert(id, { idempotencyKey: key }),
    {
      onSuccess: (a) => putAlert(qc, a),
      onError: (e, id) => handledElsewhere(qc, id, e),
      onSettled: () => void refreshCounts(qc),
    },
  );
}

export function useDismissAlert() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (v: { id: string; d: DismissIn }, key) =>
      getAlertsClient().dismissAlert(v.id, v.d, { idempotencyKey: key }),
    {
      onSuccess: (a) => putAlert(qc, a),
      onError: (e, v) => handledElsewhere(qc, v.id, e),
      onSettled: () => void refreshCounts(qc),
    },
  );
}

export function useNotificationSettings() {
  return useQuery({
    queryKey: NOTIFY_KEYS.settings,
    queryFn: () => getAlertsClient().getNotificationSettings(),
    staleTime: Infinity,
    ...READ_RETRY,
  });
}

/** What pop-ups follow: the saved settings, or both on until they load (never silently muted, R5). */
export function usePopupSettings(): NotificationSettingsOut {
  return useNotificationSettings().data ?? DEFAULT_SETTINGS;
}

const SETTINGS_WRITE = ["notification-settings", "write"] as const;

/** Saves at once on screen (B3); a failed save puts the old value back. */
export function useUpdateNotificationSettings() {
  const qc = useQueryClient();
  // True while this is the only settings save still running.
  const last = () => qc.isMutating({ mutationKey: SETTINGS_WRITE }) <= 1;
  return useKeyedMutation(
    (p: NotificationSettingsPatchIn, key) =>
      getAlertsClient().updateNotificationSettings(p, { idempotencyKey: key }),
    {
      onMutate: async (p) => {
        // A read still in flight must not overwrite the optimistic value.
        await qc.cancelQueries({ queryKey: NOTIFY_KEYS.settings });
        const before = qc.getQueryData<NotificationSettingsOut>(
          NOTIFY_KEYS.settings,
        );
        qc.setQueryData<NotificationSettingsOut>(NOTIFY_KEYS.settings, (d) => ({
          ...(d ?? DEFAULT_SETTINGS),
          ...p,
        }));
        return { before };
      },
      // With saves overlapping, only the last to finish writes the cache;
      // an earlier one leaves the newer optimistic value alone.
      onSuccess: (s) => {
        if (last()) qc.setQueryData(NOTIFY_KEYS.settings, s);
      },
      onError: (_e, _p, ctx) => {
        if (!ctx || !last()) return;
        // With nothing saved before, forget the guess: pop-ups fall back to on (R5).
        if (ctx.before) qc.setQueryData(NOTIFY_KEYS.settings, ctx.before);
        else void qc.resetQueries({ queryKey: NOTIFY_KEYS.settings });
      },
      onSettled: () => {
        // Re-read once the last save is done, so a quick second change isn't overwritten by an older read.
        if (last())
          void qc.invalidateQueries({ queryKey: NOTIFY_KEYS.settings });
      },
    },
    { mutationKey: SETTINGS_WRITE },
  );
}
