import type {
  AlertOut,
  AlertSeverity,
  NotificationSettingsOut,
} from "../api/alerts-contract";
import { parseTime } from "../corrections";
import { SEVERITY, findingLine, severityOf } from "./alert-view";

export const NOTIFICATIONS_HREF = "/notifications";
export const CORRECTIONS_HREF = "/notifications/corrections";
/** Pop-ups from the notification centre share this tag, so sign-out clears them (R4). */
export const NOTIFICATION_TAG = "notifications";
/** At most this many alert pop-ups per check; the rest become one summary (R4). */
export const POPUP_MAX = 3;
/** How long a non-Critical alert pop-up stays. Critical stays until hidden. */
export const ALERT_POPUP_MS = 12_000;
/** Alert ids remembered between checks. */
export const SEEN_MAX = 500;

const isCritical = (a: AlertOut) => severityOf(a.severity) === "critical";
const createdAt = (a: AlertOut) => parseTime(a.created_at);

/**
 * New alerts since the last check, by id: an alert is new when its id is not
 * in `seen`. The first check (`seen` null) is a baseline: alerts that already
 * exist never pop up (spec §4). Alert times are never compared with the
 * device clock, which may be wrong (A7).
 */
export function newAlerts(
  seen: ReadonlySet<string> | null,
  next: AlertOut[],
): AlertOut[] {
  if (!seen) return [];
  return next.filter((a) => a.status === "new" && !seen.has(a.id));
}

/** The ids seen so far plus these, keeping the most recent SEEN_MAX. */
export function rememberSeen(
  seen: ReadonlySet<string> | null,
  next: AlertOut[],
): Set<string> {
  const merged = new Set(seen ?? []);
  for (const a of next) {
    merged.delete(a.id);
    merged.add(a.id);
  }
  return new Set([...merged].slice(-SEEN_MAX));
}

export interface PopupPlan {
  show: AlertOut[];
  rest: AlertOut[];
}

/**
 * Which new alerts pop up: Critical always, the others only when alert
 * pop-ups are on (spec §4). Most severe first, newest first within a level;
 * at most POPUP_MAX, and the rest are summarised (Review Focus 3).
 */
export function planPopups(
  fresh: AlertOut[],
  s: Pick<NotificationSettingsOut, "alert_popups">,
): PopupPlan {
  const eligible = fresh
    .filter((a) => s.alert_popups || isCritical(a))
    .sort(
      (x, y) =>
        SEVERITY[severityOf(x.severity)].rank -
          SEVERITY[severityOf(y.severity)].rank ||
        (createdAt(y) ?? 0) - (createdAt(x) ?? 0),
    );
  return {
    show: eligible.slice(0, POPUP_MAX),
    rest: eligible.slice(POPUP_MAX),
  };
}

export interface AlertPopup {
  title: string;
  body: string;
  severity: AlertSeverity;
  /** Critical is assertive; everything else polite (spec §6). */
  live: "polite" | "assertive";
  /** Null stays until hidden. */
  ms: number | null;
  /** The View button's accessible name. */
  viewName: string;
}

/** "Critical patient alert" · "Halima Garba · Potassium 6.7 mmol/L (high; normal 3.5–5.1)". */
export function alertPopup(a: AlertOut): AlertPopup {
  const severity = severityOf(a.severity);
  const critical = severity === "critical";
  return {
    title: `${SEVERITY[severity].label} patient alert`,
    body: `${a.patient.full_name} · ${findingLine(a.finding)}`,
    severity,
    live: critical ? "assertive" : "polite",
    ms: critical ? null : ALERT_POPUP_MS,
    viewName: `View alert for ${a.patient.full_name}`,
  };
}

/** One pop-up for everything over the cap; null when nothing is left. */
export function moreAlertsPopup(rest: AlertOut[]): AlertPopup | null {
  if (!rest.length) return null;
  const critical = rest.filter(isCritical).length;
  const n = rest.length;
  return {
    title: `${n} more new patient ${n === 1 ? "alert" : "alerts"}`,
    body: critical
      ? `Including ${critical} Critical. See them all in Notifications.`
      : "See them all in Notifications.",
    severity: severityOf(rest[0]!.severity),
    live: critical ? "assertive" : "polite",
    ms: critical ? null : ALERT_POPUP_MS,
    viewName: "View all new patient alerts",
  };
}
