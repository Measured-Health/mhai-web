// Reading the analytics reply (spec §4, §5). The server computes and hides
// every number; this file checks it did, area by area, and fails an area
// closed ("Couldn't load {area}") rather than show a value it should have
// hidden, a wrong shape, or a What changed list the Critical guard can't
// vouch for. An area that fails never shows zeros and never takes the
// others down.
import { SMALL_GROUP_MIN } from "@mhai/ui/small-groups";
import {
  MEASURES,
  type AlertsRow,
  type AnalyticsOut,
  type AreaBlock,
  type Change,
  type Guarded,
  type HospitalSize,
  type MeasureId,
  type QualityRow,
  type UseRow,
} from "../api/analytics-contract";
import type { Person } from "../api/contract";
import { integrityNotificationOk } from "../audit/read";
import type { Notification } from "../api/notifications-contract";
import { rankChanges, type RankedChange } from "./changes";
import { MEASURE_AREA, MEASURE_KIND, type MeasureKind } from "./measures";
import {
  isCount,
  isHiddenValue as hidden,
  isId,
  isNum,
  isObj,
  isTime,
  shows,
  type Obj,
} from "@mhai/ui/guards";
import {
  usageGuardedOk as guardedOk,
  usageNumeratorLeaks as numeratorLeaks,
  usageScrub as scrub,
  usageSetGivesAway as setGivesAway,
} from "./usage-guards";

export const NOTHING_UNUSUAL = "Nothing unusual this period";
export const NOT_ENOUGH_TO_COMPARE = "Not enough data to compare yet";

export type AreaKey = "changes" | "use" | "alerts" | "quality" | "hospitals";
/** In page order. */
export const AREAS: readonly AreaKey[] = [
  "changes",
  "use",
  "alerts",
  "quality",
  "hospitals",
];
export const AREA_TITLE: Record<AreaKey, string> = {
  changes: "What changed",
  use: "Use",
  alerts: "Alert safety",
  quality: "Answer quality",
  hospitals: "Hospitals",
};
/** "Couldn't load what changed". */
export const failedText = (k: AreaKey) =>
  `Couldn't load ${AREA_TITLE[k].toLowerCase()}`;

export type Failed = { status: "failed" };
export type AreaState<T> = ({ status: "ok" } & T) | Failed;
export type ChangesBlock = {
  updated_at: string;
  window: { from: string; to: string };
  items: RankedChange[];
};
export type HospitalsBlock = {
  updated_at: string;
  rows: { hospital: Person; size: HospitalSize }[];
};
export type AnalyticsState = {
  changes: AreaState<ChangesBlock>;
  use: AreaState<AreaBlock<UseRow>>;
  alerts: AreaState<AreaBlock<AlertsRow>>;
  quality: AreaState<AreaBlock<QualityRow>>;
  hospitals: AreaState<HospitalsBlock>;
};

const FAILED: Failed = { status: "failed" };
const HIDDEN: Guarded = { value: null, suppressed: true };
const DIRECTIONS = new Set(["worse", "better", "rising", "falling"]);
const CHANGE_AREAS = new Set(["use", "alerts", "quality"]);
const MEASURE_IDS = new Set<string>(MEASURES);

// ---- Shapes -------------------------------------------------------------------

const isPerson = (v: unknown): v is Person =>
  isObj(v) &&
  typeof v.id === "string" &&
  isId(v.id) &&
  typeof v.name === "string" &&
  v.name.trim() !== "";

/** No two rows for the same hospital. */
const uniqueHospitals = (rows: { hospital: Person }[]) =>
  new Set(rows.map((r) => r.hospital.id)).size === rows.length;

// ---- Sets that add up -----------------------------------------------------------

// ---- The areas ------------------------------------------------------------------

type Rowish = Obj & { hospital?: unknown };

/** The area block's shared shape: time, rows, median, trend. */
function blockOk(
  b: unknown,
  bodyOk: (r: Obj, median: boolean) => boolean,
  trend: MeasureKind,
): b is AreaBlock<Rowish> {
  if (!isObj(b) || b.unavailable === true || !isTime(b.updated_at))
    return false;
  if (!Array.isArray(b.rows) || !isObj(b.median) || !Array.isArray(b.trend))
    return false;
  const rows = b.rows as unknown[];
  if (!rows.every((r) => isObj(r) && isPerson(r.hospital) && bodyOk(r, false)))
    return false;
  if (!uniqueHospitals(rows as { hospital: Person }[])) return false;
  if (!bodyOk(b.median, true)) return false;
  // A trend across all hospitals is a count (or a share) under the same
  // rule: hidden points read, an unhidden 1–4 is a leak.
  return (b.trend as unknown[]).every(
    (p) =>
      isObj(p) &&
      isTime(p.start) &&
      guardedOk(p.value, trend, trend !== "count"),
  );
}

function useOk(r: Obj, median: boolean): boolean {
  if (
    !guardedOk(r.questions, "count", median) ||
    !guardedOk(r.active_clinicians, "count", median) ||
    !guardedOk(r.questions_per_clinician, "rate", true)
  )
    return false;
  const u = r as unknown as UseRow;
  return !(
    (hidden(u.questions) || hidden(u.active_clinicians)) &&
    shows(u.questions_per_clinician)
  );
}

const SEVERITIES = ["critical", "urgent", "info"] as const;

function alertsOk(r: Obj, median: boolean): boolean {
  const sev = r.by_severity;
  if (
    !isObj(sev) ||
    !SEVERITIES.every((k) => guardedOk(sev[k], "count", median)) ||
    !guardedOk(r.total, "count", median) ||
    !guardedOk(r.unhandled, "count", median) ||
    !guardedOk(r.critical_overdue, "count", median) ||
    !guardedOk(r.median_ack_minutes, "minutes", true) ||
    !guardedOk(r.critical_median_ack_minutes, "minutes", true) ||
    !guardedOk(r.critical_within_target, "share", true) ||
    !isNum(r.critical_target_minutes) ||
    r.critical_target_minutes <= 0
  )
    return false;
  const a = r as unknown as AlertsRow;
  const crit = a.by_severity.critical;
  const overCritical =
    shows(a.critical_median_ack_minutes) || shows(a.critical_within_target);
  if (hidden(crit) && overCritical) return false;
  if (hidden(a.total) && (overCritical || shows(a.median_ack_minutes)))
    return false;
  // Within target, and outside it, are counts too (rows only: a median of
  // shares isn't a share of the median count).
  if (!median && numeratorLeaks(crit, a.critical_within_target)) return false;
  // Medians don't add up to the median total: only the set itself.
  return !setGivesAway(
    median ? null : a.total,
    SEVERITIES.map((k) => a.by_severity[k]),
  );
}

const CONFIDENCE = ["high", "medium", "low"] as const;

function qualityOk(r: Obj, median: boolean): boolean {
  const mix = r.confidence;
  if (
    !guardedOk(r.answers, "count", median) ||
    !guardedOk(r.reviews, "count", median) ||
    !isObj(mix) ||
    !CONFIDENCE.every((k) => guardedOk(mix[k], "count", median)) ||
    !guardedOk(r.needs_review_share, "share", true) ||
    !guardedOk(r.agreement_rate, "share", true) ||
    !guardedOk(r.median_review_hours, "hours", true)
  )
    return false;
  const q = r as unknown as QualityRow;
  // Reviews are some of the answers: hidden answers hide all three, and
  // leave reviews hidden or 0.
  if (
    hidden(q.answers) &&
    (shows(q.needs_review_share) ||
      shows(q.agreement_rate) ||
      shows(q.median_review_hours) ||
      (shows(q.reviews) && q.reviews.value! > 0))
  )
    return false;
  // Agreement and review time are over the reviews.
  if (
    hidden(q.reviews) &&
    (shows(q.agreement_rate) || shows(q.median_review_hours))
  )
    return false;
  if (
    !median &&
    (numeratorLeaks(q.answers, q.needs_review_share) ||
      numeratorLeaks(q.reviews, q.agreement_rate))
  )
    return false;
  return !setGivesAway(
    median ? null : q.answers,
    CONFIDENCE.map((k) => q.confidence[k]),
  );
}

function hospitalsOk(h: unknown): h is HospitalsBlock {
  if (!isObj(h) || h.unavailable === true || !isTime(h.updated_at))
    return false;
  if (!Array.isArray(h.rows)) return false;
  const rows = h.rows as unknown[];
  return (
    rows.every(
      (r) =>
        isObj(r) &&
        isPerson(r.hospital) &&
        isObj(r.size) &&
        isCount(r.size.staff) &&
        guardedOk(r.size.active_clinicians, "count", false) &&
        guardedOk(r.size.questions, "count", false),
    ) && uniqueHospitals(rows as { hospital: Person }[])
  );
}

function followUpOk(f: unknown): boolean {
  if (f === null) return true;
  return (
    isObj(f) &&
    isPerson(f.by) &&
    isTime(f.at) &&
    (f.note === null || typeof f.note === "string") &&
    isCount(f.version)
  );
}

/** The phrase, and not "fewer than 50". */
const FEWER = /fewer than 5(?!\d)/gi;
/** A number as written: "83", "1,180", "3.5". */
const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/**
 * The numbers the shown side may appear as, written the way the app
 * writes it: the value, whole or to one place, and for minutes the hours
 * and minutes of "1 h 5 min".
 */
function shownNumbers(g: Guarded, kind: MeasureKind): number[] {
  const v = g.value!;
  const out = [v, Math.round(v), Math.round(v * 10) / 10];
  if (kind === "minutes") {
    const m = Math.round(v);
    out.push(Math.floor(m / 60), m % 60);
  }
  if (kind === "hours") out.push(Math.round(v * 60));
  return out;
}

/**
 * With a side hidden, the server's words must not give it away (R8): they
 * say "fewer than 5", carry no percentage, and no number but the shown
 * side's (a delta or a second number works the hidden one out). With both
 * hidden, no number at all beyond that phrase.
 */
function summarySafe(
  summary: string,
  previous: Guarded,
  current: Guarded,
  kind: MeasureKind,
) {
  const sides = [previous, current];
  if (!sides.some(hidden)) return true;
  if (!summary.match(FEWER) || summary.includes("%")) return false;
  const numbers = summary.replace(FEWER, "").match(NUMBER) ?? [];
  const shown = sides.filter(shows);
  const allowed = shown.flatMap((g) => shownNumbers(g, kind));
  return numbers.every((t) => {
    const n = Number(t.replace(/,/g, ""));
    return allowed.some((a) => a === n);
  });
}

/**
 * What a change and a notification share: where, which measure, how it
 * moved, and both sides read under the same rules, with the summary checked
 * against what is hidden (summarySafe).
 */
function sidesOk(c: Obj): boolean {
  if (!(c.hospital === null || isPerson(c.hospital))) return false;
  if (!MEASURE_IDS.has(c.measure as string)) return false;
  if (!DIRECTIONS.has(c.direction as string)) return false;
  if (typeof c.serious !== "boolean") return false;
  if (typeof c.summary !== "string" || c.summary.trim() === "") return false;
  const kind = MEASURE_KIND[c.measure as Change["measure"]];
  return (
    guardedOk(c.previous, kind, true) &&
    guardedOk(c.current, kind, true) &&
    summarySafe(c.summary, c.previous as Guarded, c.current as Guarded, kind)
  );
}

/** A notification reads under the same rules as a change in What changed. */
export function notificationOk(n: unknown): n is Notification {
  if (isObj(n) && n.kind === "audit_integrity")
    return integrityNotificationOk(n);
  return (
    isObj(n) &&
    (n.kind === undefined || n.kind === "analytics_change") &&
    isId(n.id) &&
    isId(n.change_id) &&
    isTime(n.at) &&
    typeof n.seen === "boolean" &&
    sidesOk(n)
  );
}

/**
 * A change reads when its shape does. A side may be hidden (shown
 * "Fewer than 5", ranked unsized) when the summary doesn't give it away;
 * previous may be null: no previous period.
 */
function changeOk(c: unknown): c is Change {
  if (!isObj(c)) return false;
  if (!isId(c.id)) return false;
  if (!CHANGE_AREAS.has(c.area as string)) return false;
  if (!sidesOk(c)) return false;
  if (MEASURE_AREA[c.measure as Change["measure"]] !== c.area) return false;
  return followUpOk(c.follow_up) && isCount(c.version);
}

/**
 * The Critical guard (anti-goal 2): every hospital with unhandled Critical
 * alerts past target (above 0 or hidden) has a serious change in the list.
 */
function criticalCovered(items: Change[], alerts: AreaBlock<AlertsRow>) {
  const serious = new Set(
    items.filter((c) => c.serious && c.hospital).map((c) => c.hospital!.id),
  );
  return alerts.rows.every((r) => {
    const o = r.critical_overdue;
    const overdue = o.suppressed || (o.value !== null && o.value > 0);
    return !overdue || serious.has(r.hospital.id);
  });
}

function readChanges(
  c: unknown,
  alerts: AreaState<AreaBlock<AlertsRow>>,
): AreaState<ChangesBlock> {
  // Without readable alerts the guard can't be checked: fail closed.
  if (alerts.status !== "ok") return FAILED;
  if (!isObj(c) || c.unavailable === true || !isTime(c.updated_at))
    return FAILED;
  const w = c.window;
  if (!isObj(w) || !isTime(w.from) || !isTime(w.to)) return FAILED;
  if (!Array.isArray(c.items) || !(c.items as unknown[]).every(changeOk))
    return FAILED;
  const items = c.items as Change[];
  if (new Set(items.map((x) => x.id)).size !== items.length) return FAILED;
  if (!criticalCovered(items, alerts)) return FAILED;
  return {
    status: "ok",
    updated_at: c.updated_at,
    window: { from: w.from, to: w.to },
    items: rankChanges(scrub(items)),
  };
}

function area<R>(
  b: unknown,
  bodyOk: (r: Obj, median: boolean) => boolean,
  trend: MeasureKind,
): AreaState<AreaBlock<R>> {
  if (!blockOk(b, bodyOk, trend)) return FAILED;
  return { status: "ok", ...(scrub(b) as unknown as AreaBlock<R>) };
}

/** Each area read on its own; see the file comment. */
export function readAnalytics(a: AnalyticsOut): AnalyticsState {
  const x: Obj = isObj(a) ? a : {};
  const alerts = area<AlertsRow>(x.alerts, alertsOk, "count");
  return {
    changes: readChanges(x.changes, alerts),
    use: area<UseRow>(x.use, useOk, "count"),
    alerts,
    quality: area<QualityRow>(x.quality, qualityOk, "share"),
    hospitals: hospitalsOk(x.hospitals)
      ? { status: "ok", ...scrub(x.hospitals) }
      : FAILED,
  };
}

// ---- One measure over the period (the compare chart) ---------------------------

/**
 * A point of the compare chart. `median` is null when there is none (All
 * hospitals, or no other hospital had data) and hidden when it would be a
 * count of 1–4.
 */
export type SeriesPoint = {
  start: string;
  value: Guarded;
  median: Guarded | null;
};
export type SeriesState =
  | {
      status: "ok";
      measure: MeasureId;
      hospital: Person;
      points: SeriesPoint[];
    }
  | Failed;

/**
 * Reads a compare-chart reply for the measure the app asked for. It fails
 * closed on a wrong shape, a different measure, or a count sent unhidden
 * between 0 and 5. A count median between 0 and 5 is hidden: no mark, not
 * in the scale, "Fewer than 5" in words.
 */
export function readSeries(s: unknown, measure: MeasureId): SeriesState {
  if (!isObj(s) || s.measure !== measure || !isPerson(s.hospital))
    return FAILED;
  if (!Array.isArray(s.points)) return FAILED;
  const kind = MEASURE_KIND[measure];
  const points: SeriesPoint[] = [];
  for (const p of s.points as unknown[]) {
    if (!isObj(p) || !isTime(p.start)) return FAILED;
    if (!guardedOk(p.value, kind, kind !== "count")) return FAILED;
    const m = p.median;
    if (m !== null && (!isNum(m) || m < 0)) return FAILED;
    points.push({
      start: p.start,
      value: scrub(p.value as Guarded),
      median:
        m === null
          ? null
          : kind === "count" && m > 0 && m < SMALL_GROUP_MIN
            ? HIDDEN
            : { value: m, suppressed: false },
    });
  }
  return {
    status: "ok",
    measure,
    hospital: { id: s.hospital.id, name: s.hospital.name },
    points,
  };
}
