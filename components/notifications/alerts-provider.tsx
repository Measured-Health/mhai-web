"use client";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AlertOut, AlertPageOut } from "@/lib/api/alerts-contract";
import {
  NOTIFY_KEYS,
  alertsOff,
  useAlertFeed,
  usePopupSettings,
  useUnreadAlerts,
} from "@/lib/notification-queries";
import {
  NOTIFICATIONS_HREF,
  NOTIFICATION_TAG,
  alertPopup,
  baselineFrom,
  moreAlertsPopup,
  newAlerts,
  planPopups,
  rememberSeen,
  type AlertPopup,
} from "@/lib/notifications/popups";
import { useShell } from "../shell/shell-context";
import { useToast } from "../ui/toast";

type Ctx = {
  /** New alerts no one has handled, from the API; 0 until known (R1). */
  unread: number;
  /** False when the hospital has no patient alerts yet (R12). */
  available: boolean;
  /** The newest new alerts, for the bell. */
  latest: AlertOut[];
  /** The alert a "View" asked for, until the page shows it. Memory only (R3). */
  focusId: string | null;
  /** Goes up on every "View", so the alerts page starts again from New. */
  focusSeq: number;
  /** Opens the Notifications page; with an id, at that alert. */
  openAlert(id: string | null): void;
  focusDone(): void;
};
const AlertsCtx = createContext<Ctx | null>(null);

/** Null outside the clinical shell: admin-only people have no alerts. */
export const useAlerts = () => useContext(AlertsCtx);

/**
 * Polls new alerts and the unread count while a clinician is signed in, and
 * pops up what's new (spec §4): the first answer is a baseline; Critical
 * always pops up; the rest follow "Pop-ups for patient alerts"; a burst is
 * capped (R4). Memory only.
 */
export function AlertsProvider({ children }: { children: ReactNode }) {
  const feed = useAlertFeed();
  const unread = useUnreadAlerts();
  const { alert_popups } = usePopupSettings();
  const qc = useQueryClient();
  const { show } = useToast();
  const { navigate } = useShell();
  const [focus, setFocus] = useState<{ id: string | null; seq: number }>({
    id: null,
    seq: 0,
  });
  const seen = useRef<Set<string> | null>(null);
  // The newest server time in the first answer; fixed after that. No device clock (A7).
  const watermark = useRef<number | null>(null);
  // Read inside the cache subscription, which outlives renders.
  const popups = useRef(alert_popups);
  const go = useRef(navigate);
  useEffect(() => {
    popups.current = alert_popups;
    go.current = navigate;
  }, [alert_popups, navigate]);

  const openAlert = useCallback((id: string | null) => {
    setFocus((f) => ({ id, seq: f.seq + 1 }));
    go.current(NOTIFICATIONS_HREF);
  }, []);
  const focusDone = useCallback(
    () => setFocus((f) => (f.id ? { ...f, id: null } : f)),
    [],
  );

  useEffect(() => {
    const baseline = (list: AlertOut[]) => {
      seen.current = rememberSeen(null, list);
      watermark.current = baselineFrom(list);
    };
    const cached = qc.getQueryData<AlertPageOut>(NOTIFY_KEYS.feed);
    if (cached && !seen.current) baseline(cached.alerts);
    const pop = (p: AlertPopup, id: string | null) =>
      show({
        title: p.title,
        body: p.body,
        severity: p.severity,
        live: p.live,
        ms: p.ms,
        tag: NOTIFICATION_TAG,
        action: {
          label: "View",
          name: p.viewName,
          onClick: () => openAlert(id),
        },
      });
    // Subscribing to the cache sees every answer, whichever screen asked.
    return qc.getQueryCache().subscribe((e) => {
      if (e.type !== "updated" || e.action.type !== "success") return;
      const [a, b] = e.query.queryKey;
      if (a !== NOTIFY_KEYS.feed[0] || b !== NOTIFY_KEYS.feed[1]) return;
      const list =
        (e.query.state.data as AlertPageOut | undefined)?.alerts ?? [];
      // The first answer is the baseline and pops nothing (spec §4).
      if (!seen.current) {
        baseline(list);
        return;
      }
      const fresh = newAlerts(seen.current, list, watermark.current);
      seen.current = rememberSeen(seen.current, list);
      if (!fresh.length) return;
      // The Notifications page lists them too.
      void qc.invalidateQueries({ queryKey: NOTIFY_KEYS.lists });
      const plan = planPopups(fresh, { alert_popups: popups.current });
      for (const al of plan.show) pop(alertPopup(al), al.id);
      const more = moreAlertsPopup(plan.rest);
      if (more) pop(more, null);
    });
  }, [qc, show, openAlert]);

  const value = useMemo<Ctx>(
    () => ({
      unread: unread.data ?? 0,
      available: !alertsOff(feed.error),
      latest: (feed.data?.alerts ?? []).filter((a) => a.status === "new"),
      focusId: focus.id,
      focusSeq: focus.seq,
      openAlert,
      focusDone,
    }),
    [unread.data, feed.error, feed.data, focus, openAlert, focusDone],
  );
  return <AlertsCtx.Provider value={value}>{children}</AlertsCtx.Provider>;
}
