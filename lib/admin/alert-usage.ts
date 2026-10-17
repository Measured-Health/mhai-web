import type {
  AlertSeriesOut,
  ChangeDirection,
  ChangeOut,
  GuardedOut,
  MeasureOut,
  RisingOut,
  SeriesBucketOut,
  UsageAlertsOut,
  UsageOut,
  UsagePeriod,
  WorseningOut,
} from "../api/admin-contract";
import type { AlertLocationOut, AlertSeverity } from "../api/alerts-contract";
import {
  DISMISS_REASONS,
  NOT_STANDARDISED,
  flagWord,
  locationLabel,
} from "../notifications/alert-view";
import type { Column } from "../charts";
import { FEWER_THAN_5, SMALL_GROUP_MIN, isSmallCount } from "../small-groups";
import { countLabel, percentLabel } from "./report";

// The usage alerts wording and guards (Plan 5b). The backend computes every
// number, change and flag; this file only reads, guards and words them.

/** Top findings and locations shown at most (spec §3). */
export const TOP_MAX = 5;
export const ALERTS_INTRO =
  "Counts for your hospital only. Groups of fewer than 5 are hidden.";
export const ALERTS_FAILED = "Couldn't load patient alerts";
export const NOTHING_UNUSUAL = "Nothing unusual this period";
export const NOT_ENOUGH_TO_COMPARE = "Not enough data to compare";
export const NO_DATA = "No data yet";
export const UNUSUALLY_BUSY = "Unusually busy";
export const SEVERITY_ORDER: readonly AlertSeverity[] = [
  "critical",
  "urgent",
  "info",
];

export type MeasureKind = "count" | "minutes" | "share";
export type Shown =
  { kind: "value"; value: number } | { kind: "hidden" } | { kind: "none" };
export type AlertsState =
  | { state: "off" }
  | { state: "failed" }
  | { state: "ready"; alerts: UsageAlertsOut };
export type Better = "lower" | "higher" | null;
export type ChangeItem = {
  key: string;
  kind: "worse" | "busy" | "rising";
  text: string;
};
export type WhatChanged =
  | { kind: "no_previous" }
  | { kind: "nothing" }
  | { kind: "items"; items: ChangeItem[] };

const DIRECTIONS = new Set(["up", "down", "same"]);
const REASON_CODES = new Set<string>(DISMISS_REASONS.map((r) => r.code));

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isCount = (v: unknown): v is number =>
  isNum(v) && Number.isInteger(v) && v >= 0;
const isShare = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1;
const isLabel = (v: unknown) => v === null || typeof v === "string";

/**
 * A readable value of its kind. Hidden is always readable (whatever `value`
 * says, it's never shown). Nothing to measure is a median's or share's
 * state; a count always has a number.
 */
function guardedOk(v: unknown, kind: MeasureKind): boolean {
  if (!isObj(v) || typeof v.suppressed !== "boolean") return false;
  if (v.suppressed) return true;
  if (v.value === null) return kind !== "count";
  if (kind === "count") return isCount(v.value);
  if (kind === "share") return isShare(v.value);
  return isNum(v.value) && v.value >= 0;
}

function changeOk(c: unknown): boolean {
  if (c === null || c === undefined) return true;
  return (
    isObj(c) &&
    DIRECTIONS.has(c.direction as string) &&
    isNum(c.amount) &&
    c.amount >= 0 &&
    isNum(c.previous) &&
    c.previous >= 0
  );
}

const measureOk = (v: unknown, kind: MeasureKind) =>
  guardedOk(v, kind) && changeOk((v as Record<string, unknown>).change);

/** "YYYY-MM-DD" that is a real calendar day. */
function isDay(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function seriesOk(s: unknown): boolean {
  if (!isObj(s) || (s.bucket !== "day" && s.bucket !== "week")) return false;
  if (!Array.isArray(s.points)) return false;
  let prev = "";
  for (const p of s.points as unknown[]) {
    if (!isObj(p) || !isDay(p.start) || p.start <= prev) return false;
    if (!isCount(p.total)) return false;
    // A flag always says "more than usual"; anything else can't be read.
    const x = p.usual_multiple;
    if (x !== null && !(isNum(x) && x > 1)) return false;
    prev = p.start;
  }
  return true;
}

function risingOk(r: unknown): boolean {
  if (!isObj(r) || !isCount(r.count) || !isCount(r.previous)) return false;
  if (r.kind === "finding") return isLabel(r.name) && isLabel(r.flag);
  if (r.kind === "location") return r.location === null || isObj(r.location);
  return false;
}

const worseningOk = (w: unknown) =>
  w === null || (isObj(w) && isShare(w.value) && isShare(w.previous));

function listsOk(a: Record<string, unknown>): boolean {
  const { dismiss_reasons: rs, top_findings: fs, top_locations: ls } = a;
  if (!Array.isArray(rs) || !Array.isArray(fs) || !Array.isArray(ls))
    return false;
  const reasonsOk =
    rs.length === REASON_CODES.size &&
    rs.every(
      (r) =>
        isObj(r) &&
        REASON_CODES.has(r.reason as string) &&
        guardedOk(r.count, "count"),
    ) &&
    new Set(rs.map((r: { reason: string }) => r.reason)).size === rs.length;
  return (
    reasonsOk &&
    fs.every(
      (f) =>
        isObj(f) &&
        isLabel(f.name) &&
        isLabel(f.flag) &&
        guardedOk(f.count, "count"),
    ) &&
    ls.every(
      (l) =>
        isObj(l) &&
        (l.location === null || isObj(l.location)) &&
        guardedOk(l.count, "count"),
    )
  );
}

const leaks = (g: GuardedOut) =>
  !g.suppressed && g.value !== null && isSmallCount(g.value);

/**
 * In a set that adds up, a hidden value can be worked out from the others
 * when it is hidden alone, or when a raw 1 to 4 arrives among them (writing
 * "Fewer than 5" would not stop the sum giving it away). The server never
 * sends either (spec §4); if it does, nothing in the block is shown (F7).
 */
function givesAway(set: GuardedOut[], kind: MeasureKind): boolean {
  if (kind === "count" && set.some(leaks)) return true;
  return set.filter((g) => shown(g, kind).kind === "hidden").length === 1;
}

/**
 * With the total shown, hidden severities together are the total minus the
 * shown ones. Under 5 gives them away ("3" says both are 1 or 2); 0 or less
 * doesn't add up at all (a hidden group is never 0).
 */
function severitiesGiveAway(a: UsageAlertsOut, sev: GuardedOut[]): boolean {
  const t = shown(a.total, "count");
  if (
    t.kind !== "value" ||
    !sev.some((g) => shown(g, "count").kind === "hidden")
  )
    return false;
  let rest = t.value;
  for (const g of sev) {
    const s = shown(g, "count");
    if (s.kind === "value") rest -= s.value;
  }
  return rest < SMALL_GROUP_MIN;
}

function safeSets(a: UsageAlertsOut): boolean {
  const sev = SEVERITY_ORDER.map((k) => a.by_severity[k]);
  return !(
    givesAway([a.total, ...sev], "count") ||
    severitiesGiveAway(a, sev) ||
    givesAway(
      a.dismiss_reasons.map((r) => r.count),
      "count",
    ) ||
    givesAway([a.acknowledged_share, a.dismissed_share], "share")
  );
}

const isValue = (g: GuardedOut, kind: MeasureKind) =>
  shown(g, kind).kind === "value";

/**
 * Shares and medians are hidden when the group they're computed over is
 * (spec §4): a share of 3 Critical alerts says something about each of
 * them. The server never sends one; if it does, nothing in the block is
 * shown. Nothing to measure (null) gives nothing away.
 */
function overHidden(a: UsageAlertsOut): boolean {
  const hidden = (g: GuardedOut) => shown(g, "count").kind === "hidden";
  const overCritical =
    isValue(a.median_ack_minutes_critical, "minutes") ||
    isValue(a.critical_within_target, "share") ||
    a.worsening !== null;
  const overTotal =
    overCritical ||
    isValue(a.median_ack_minutes, "minutes") ||
    isValue(a.acknowledged_share, "share") ||
    isValue(a.dismissed_share, "share");
  return (
    (hidden(a.by_severity.critical) && overCritical) ||
    (hidden(a.total) && overTotal)
  );
}

/**
 * Off when null or absent (R1). Failed when unavailable, unreadable in any
 * part (a value, the series, a flag, the target), when a hidden value
 * could be worked out, or when a share or median over a hidden group is
 * shown: the group then says so and never shows zeros or
 * "Nothing unusual" (R2, Review Focus 1).
 */
export function readAlerts(u: Pick<UsageOut, "alerts">): AlertsState {
  const a: unknown = u.alerts;
  if (a === null || a === undefined) return { state: "off" };
  if (!isObj(a) || a.unavailable === true) return { state: "failed" };
  const sev = a.by_severity;
  const ok =
    isNum(a.critical_target_minutes) &&
    a.critical_target_minutes > 0 &&
    typeof a.has_previous === "boolean" &&
    measureOk(a.total, "count") &&
    measureOk(a.unhandled, "count") &&
    isObj(sev) &&
    SEVERITY_ORDER.every((k) => measureOk(sev[k], "count")) &&
    measureOk(a.median_ack_minutes, "minutes") &&
    measureOk(a.median_ack_minutes_critical, "minutes") &&
    measureOk(a.critical_within_target, "share") &&
    measureOk(a.acknowledged_share, "share") &&
    measureOk(a.dismissed_share, "share") &&
    listsOk(a) &&
    seriesOk(a.series) &&
    Array.isArray(a.rising) &&
    a.rising.every(risingOk) &&
    worseningOk(a.worsening);
  if (!ok) return { state: "failed" };
  const alerts = a as unknown as UsageAlertsOut;
  return safeSets(alerts) && !overHidden(alerts) && flagsShowable(alerts)
    ? { state: "ready", alerts }
    : { state: "failed" };
}

/**
 * Every flag the server sent can be shown. A flag the guards would drop
 * (worsening beside a hidden or missing share change, or one that isn't a
 * drop; a rising group under 5) would leave What changed reading "Nothing
 * unusual this period": the block reads as couldn't load instead. Without a
 * previous period flags are ignored, not refused (R5, Review Focus 3).
 */
function flagsShowable(a: UsageAlertsOut): boolean {
  if (!a.has_previous) return true;
  const w = a.worsening;
  if (w) {
    const c = changeFor(a.critical_within_target, "share", true);
    if (!c || shownDirection(c) !== "down" || !(w.value < w.previous))
      return false;
  }
  return a.rising.every(bigEnough);
}

/**
 * The small-group guard (R3): suppressed reads hidden whatever `value` says;
 * a count from 1 to 4 reads hidden too; 0 is shown.
 */
export function shown(
  m: GuardedOut | null | undefined,
  kind: MeasureKind,
): Shown {
  if (!m) return { kind: "none" };
  if (m.suppressed) return { kind: "hidden" };
  if (m.value === null || !Number.isFinite(m.value)) return { kind: "none" };
  if (kind === "count" && isSmallCount(m.value)) return { kind: "hidden" };
  return { kind: "value", value: m.value };
}

/** "22 min", or hours from 60 minutes on: "1.6 h". */
export function minutesLabel(m: number): string {
  const min = Math.round(m);
  return min < 60
    ? `${min} min`
    : `${(m / 60).toFixed(1).replace(/\.0$/, "")} h`;
}

export function valueText(s: Shown, kind: MeasureKind): string {
  if (s.kind === "hidden") return FEWER_THAN_5;
  if (s.kind === "none") return NO_DATA;
  if (kind === "minutes") return minutesLabel(s.value);
  if (kind === "share") return percentLabel(s.value);
  return countLabel(s.value);
}

const COMPARE: Record<UsagePeriod, string> = {
  this_month: "vs last month",
  last_month: "vs the month before",
  last_90_days: "vs the 90 days before",
};
export const compareLabel = (p: UsagePeriod) => COMPARE[p];

/** The backend's change, only when it can honestly be shown (R4, R5). */
export function changeFor(
  m: MeasureOut | null | undefined,
  kind: MeasureKind,
  hasPrevious: boolean,
): ChangeOut | null {
  const c = m?.change;
  if (!hasPrevious || !c || shown(m, kind).kind !== "value") return null;
  // Belt and braces: readAlerts has already refused an unreadable change.
  if (!DIRECTIONS.has(c.direction) || !Number.isFinite(c.amount)) return null;
  if (!Number.isFinite(c.previous)) return null;
  // A hidden previous count, or a percentage from 0 (spec §5.1).
  if (kind === "count" && (isSmallCount(c.previous) || c.previous === 0))
    return null;
  return c;
}

/**
 * The direction as shown: "same" when the amount rounds to 0, so the arrow,
 * the words and better/worse never contradict each other.
 */
export const shownDirection = (c: ChangeOut): ChangeDirection =>
  c.direction === "same" || Math.round(Math.abs(c.amount)) === 0
    ? "same"
    : c.direction;

export function changeText(
  c: ChangeOut,
  kind: MeasureKind,
  p: UsagePeriod,
): string {
  const d = shownDirection(c);
  if (d === "same") return `no change ${compareLabel(p)}`;
  const n = Math.round(Math.abs(c.amount));
  const amount =
    kind === "count"
      ? `${n}%`
      : kind === "minutes"
        ? minutesLabel(n)
        : `${n} ${n === 1 ? "point" : "points"}`;
  return `${d} ${amount} ${compareLabel(p)}`;
}

/** Only response times read better or worse; volumes and outcomes are neutral (R4). */
export function verdict(
  c: ChangeOut,
  better: Better,
): "better" | "worse" | null {
  const d = shownDirection(c);
  if (!better || d === "same") return null;
  return (d === "down") === (better === "lower") ? "better" : "worse";
}

export const criticalTargetLabel = (min: number) =>
  `Critical handled within ${min} min`;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "14 Oct" from "2026-10-14": the hospital's calendar day, as sent. */
export function dayLabel(start: string): string {
  const d = new Date(`${start.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(d.getTime())
    ? start
    : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const bucketLabel = (start: string, bucket: "day" | "week") =>
  bucket === "week" ? `Week of ${dayLabel(start)}` : dayLabel(start);

export const alertCount = (n: number) =>
  n === 1 ? "1 alert" : `${countLabel(n)} alerts`;

/** The chart's one-line summary: the busiest bucket (display, not statistics). */
export function seriesSummary(s: AlertSeriesOut): string {
  let top: SeriesBucketOut | null = null;
  for (const p of s.points) if (p.total > (top?.total ?? 0)) top = p;
  if (!top) return "No alerts in this period";
  return s.bucket === "week"
    ? `Most alerts in the week of ${dayLabel(top.start)}: ${countLabel(top.total)}`
    : `Most alerts on ${dayLabel(top.start)}: ${countLabel(top.total)}`;
}

/** "about 3× the usual" for a flagged bucket (R7); null when not flagged. */
export function usualMark(b: SeriesBucketOut): string | null {
  const x = b.usual_multiple;
  if (x === null || !Number.isFinite(x) || x <= 1) return null;
  const n = x >= 2 ? String(Math.round(x)) : x.toFixed(1);
  return `about ${n}× the usual`;
}

export function unusualLine(b: SeriesBucketOut, bucket: "day" | "week") {
  const mark = usualMark(b);
  const head = `${bucketLabel(b.start, bucket)}: ${alertCount(b.total)}`;
  return mark ? `${head}, ${mark}` : head;
}

/** "Potassium · low"; unmapped findings are one "Not standardised" row (R8). */
export function findingLabel(g: {
  name: string | null;
  flag: string | null;
}): string {
  const name = g.name?.trim();
  if (!name) return NOT_STANDARDISED;
  const flag = flagWord(g.flag);
  return flag ? `${name} · ${flag}` : name;
}

/** Ward level at most: a bed is never shown on Usage (R8). */
export const placeLabel = (l: AlertLocationOut | null | undefined) =>
  locationLabel(l?.kind === "admitted" ? { ...l, bed: null } : l);

export const risingLine = (r: RisingOut) =>
  `${r.kind === "finding" ? findingLabel(r) : placeLabel(r.location)}: ${countLabel(r.count)}, up from ${countLabel(r.previous)}`;

export const worseningLine = (w: WorseningOut, target: number) =>
  `Critical within ${target} min: ${percentLabel(w.value)}, down from ${percentLabel(w.previous)}`;

// The finite checks are belt and braces: readAlerts has checked them.
const bigEnough = (r: RisingOut) =>
  Number.isFinite(r.count) &&
  Number.isFinite(r.previous) &&
  r.count >= SMALL_GROUP_MIN &&
  r.previous >= SMALL_GROUP_MIN;

/** The What changed list (R5, R6). Only called once the block is ready. */
export function whatChanged(a: UsageAlertsOut): WhatChanged {
  if (!a.has_previous) return { kind: "no_previous" };
  const items: ChangeItem[] = [];
  const w = a.worsening;
  // Only beside a shown change: the server sends none when the previous
  // period's share was hidden, and "down from 88%" would reveal it (F6).
  // Belt and braces: readAlerts refuses a block where this would drop it.
  if (
    w &&
    Number.isFinite(w.value) &&
    Number.isFinite(w.previous) &&
    changeFor(a.critical_within_target, "share", true)
  )
    items.push({
      key: "worsening",
      kind: "worse",
      text: worseningLine(w, a.critical_target_minutes),
    });
  for (const b of a.series.points)
    if (usualMark(b))
      items.push({
        key: `busy-${b.start}`,
        kind: "busy",
        text: unusualLine(b, a.series.bucket),
      });
  for (const kind of ["finding", "location"] as const)
    // bigEnough is belt and braces here too (readAlerts refuses small ones).
    a.rising
      .filter((r) => r.kind === kind && bigEnough(r))
      .forEach((r, i) =>
        items.push({
          key: `rising-${kind}-${i}`,
          kind: "rising",
          text: risingLine(r),
        }),
      );
  return items.length ? { kind: "items", items } : { kind: "nothing" };
}

/** The chart's columns; marks only when there's a previous period (R5). */
export const columnsOf = (a: UsageAlertsOut): Column[] =>
  a.series.points.map((b) => ({
    key: b.start,
    label: bucketLabel(b.start, a.series.bucket),
    value: b.total,
    mark: a.has_previous ? usualMark(b) : null,
  }));
