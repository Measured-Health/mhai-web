import type {
  AlertCategory,
  AlertHandling,
  AlertRoute,
  GuardedOut,
  UsageAlertsOut,
  UsageOut,
} from "../api/admin-contract";
import type { AlertSeverity } from "../api/alerts-contract";
import { FEWER_THAN_5, isSmallCount } from "@mhai/ui/small-groups";
import { countLabel } from "./report";

// The usage alerts wording and guards, on core's block (OpenAPI 1.24.0):
// this period's alerts by severity, category, route and handling. Core
// computes and guards every number; this file reads, checks and words them.

export const ALERTS_INTRO =
  "Counts for your hospital only. Groups of fewer than 5 are hidden.";
export const ALERTS_FAILED = "Couldn't load patient alerts";
export const NO_DATA = "No data yet";
export const SEVERITY_ORDER: readonly AlertSeverity[] = [
  "critical",
  "urgent",
  "info",
];

/** Core's categories, in its order, as plain words. */
export const CATEGORY_LABEL: Record<AlertCategory, string> = {
  blood_chemistry: "Blood chemistry",
  blood_count: "Blood count",
  kidney_function: "Kidney function",
  blood_gases_lactate: "Blood gases and lactate",
  heart_markers: "Heart markers",
  blood_sugar: "Blood sugar",
  vital_signs: "Vital signs",
  infection_markers: "Infection markers",
};
export const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL) as AlertCategory[];

export const ROUTE_LABEL: Record<AlertRoute, string> = {
  queue: "Hospital queue",
  named: "Named clinicians",
};
export const ROUTE_ORDER: readonly AlertRoute[] = ["queue", "named"];

export const HANDLING_LABEL: Record<AlertHandling, string> = {
  open: "Not handled yet",
  acknowledged: "Acknowledged",
  dismissed: "Dismissed",
  withdrawn: "Withdrawn before anyone handled it",
};
export const HANDLING_ORDER: readonly AlertHandling[] = [
  "open",
  "acknowledged",
  "dismissed",
  "withdrawn",
];

export type Shown =
  { kind: "value"; value: number } | { kind: "hidden" } | { kind: "none" };
export type AlertsState =
  | { state: "off" }
  | { state: "failed" }
  | { state: "ready"; alerts: UsageAlertsOut };

/**
 * The small-group guard (R3): suppressed reads hidden; a count from 1 to 4
 * reads hidden too; 0 is shown.
 */
export function shown(m: GuardedOut | null | undefined): Shown {
  if (!m) return { kind: "none" };
  if (m.suppressed) return { kind: "hidden" };
  if (m.value === null || !Number.isFinite(m.value)) return { kind: "none" };
  if (isSmallCount(m.value)) return { kind: "hidden" };
  return { kind: "value", value: m.value };
}

export function valueText(s: Shown): string {
  if (s.kind === "hidden") return FEWER_THAN_5;
  if (s.kind === "none") return NO_DATA;
  return countLabel(s.value);
}

/** "22 min", or hours from 60 minutes on: "1.6 h". */
export function minutesLabel(m: number): string {
  const min = Math.round(m);
  return min < 60
    ? `${min} min`
    : `${(m / 60).toFixed(1).replace(/\.0$/, "")} h`;
}

const hidden = (g: GuardedOut) => shown(g).kind === "hidden";
const raw1to4 = (g: GuardedOut) =>
  !g.suppressed && g.value !== null && isSmallCount(g.value);

/**
 * Whether a breakdown that splits the total gives a hidden value away: one
 * hidden part beside a shown total (total minus the rest), or a hidden total
 * with every part shown (their sum).
 */
function givesAway(total: GuardedOut, parts: GuardedOut[]): boolean {
  const n = parts.filter(hidden).length;
  if (!hidden(total)) return n === 1;
  return n === 0;
}

/**
 * Off when null (no record source). Failed when core couldn't compute it,
 * when any count is a shown 1 to 4, or when a hidden count could be worked
 * out from its set: the group then says so and never shows zeros (R2).
 * Severity, category and handling each split the total; routes overlap (one
 * alert can go to both), so they are only checked for small counts.
 */
export function readAlerts(u: Pick<UsageOut, "alerts">): AlertsState {
  const a = u.alerts;
  if (a === null || a === undefined) return { state: "off" };
  if ("unavailable" in a) return { state: "failed" };
  const sets = [
    Object.values(a.by_severity),
    Object.values(a.by_category),
    Object.values(a.by_handling),
  ];
  const all = [a.total, ...sets.flat(), ...Object.values(a.by_route)];
  if (all.some(raw1to4)) return { state: "failed" };
  if (sets.some((parts) => givesAway(a.total, parts)))
    return { state: "failed" };
  return { state: "ready", alerts: a };
}
