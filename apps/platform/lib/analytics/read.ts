// Reading the analytics reply (spec §4, §5). The server computes and hides
// every number; this file checks it did, area by area, and fails an area
// closed ("Couldn't load {area}") rather than show a value it should have
// hidden, a wrong shape, or a What changed list the Critical guard can't
// vouch for. An area that fails never shows zeros and never takes the
// others down.
import { SMALL_GROUP_MIN, isSmallCount } from "@mhai/ui/small-groups";
import {
  MEASURES,
  type AlertsRow,
  type AnalyticsOut,
  type AreaBlock,
  type Change,
  type Guarded,
  type HospitalSize,
  type QualityRow,
  type UseRow,
} from "../api/analytics-contract";
import type { Person } from "../api/contract";
import { rankChanges, type RankedChange } from "./changes";
import { MEASURE_AREA, MEASURE_KIND, type MeasureKind } from "./measures";

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
const ID = /^[A-Za-z0-9_-]+$/;
const DIRECTIONS = new Set(["worse", "better", "rising", "falling"]);
const CHANGE_AREAS = new Set(["use", "alerts", "quality"]);
const MEASURE_IDS = new Set<string>(MEASURES);

// ---- Shapes -------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isCount = (v: unknown): v is number =>
  isNum(v) && Number.isInteger(v) && v >= 0;
const isTime = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}/.test(v) &&
  !Number.isNaN(Date.parse(v));
const isPerson = (v: unknown): v is Person =>
  isObj(v) &&
  typeof v.id === "string" &&
  ID.test(v.id) &&
  typeof v.name === "string" &&
  v.name.trim() !== "";

/**
 * A readable value of its kind. Hidden is always readable (its number, if
 * any, is dropped). Null is nothing to show, allowed where `loose`. A
 * count sent unhidden between 0 and 5 is not readable (a leak). A count is
 * a whole number, except where `loose`: a median of counts over an even
 * number of hospitals, or a weekly average in a change, can be 125.5.
 */
function guardedOk(v: unknown, kind: MeasureKind, loose: boolean): boolean {
  if (!isObj(v) || typeof v.suppressed !== "boolean") return false;
  if (v.suppressed) return true;
  if (v.value === null) return loose;
  if (kind === "count") {
    const n = v.value;
    if (!isNum(n) || n < 0 || (!loose && !Number.isInteger(n))) return false;
    return !(n > 0 && n < SMALL_GROUP_MIN);
  }
  if (kind === "share") return isNum(v.value) && v.value >= 0 && v.value <= 1;
  return isNum(v.value) && v.value >= 0;
}

const hidden = (g: Guarded) => g.suppressed;
const shows = (g: Guarded) => !g.suppressed && g.value !== null;

/**
 * A share of a shown count gives its numerator away: `total × share`. It
 * must not come to 1–4, nor (with `complement`) leave 1–4 outside it.
 */
function numeratorLeaks(total: Guarded, share: Guarded, complement: boolean) {
  if (!shows(total) || !shows(share)) return false;
  const n = Math.round(total.value! * share.value!);
  return isSmallCount(n) || (complement && isSmallCount(total.value! - n));
}

/** Every hidden value as `{value: null, suppressed: true}`, deep. */
function scrub<T>(v: T): T {
  if (Array.isArray(v)) return v.map(scrub) as T;
  if (!isObj(v)) return v;
  if (typeof v.suppressed === "boolean" && "value" in v)
    return (v.suppressed ? HIDDEN : { value: v.value, suppressed: false }) as T;
  return Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k, scrub(x)]),
  ) as T;
}

/** No two rows for the same hospital. */
const uniqueHospitals = (rows: { hospital: Person }[]) =>
  new Set(rows.map((r) => r.hospital.id)).size === rows.length;

// ---- Sets that add up -----------------------------------------------------------

/**
 * In a set that adds up (a total and its members), exactly one hidden
 * value can be worked out from the others; with the total shown, hidden
 * members together are the total minus the shown ones, which under 5 (or
 * at or under 0) gives them away (the Plan 5b rule).
 */
function setGivesAway(total: Guarded | null, members: Guarded[]): boolean {
  const all = total ? [total, ...members] : members;
  if (all.filter(hidden).length === 1) return true;
  if (!total || !shows(total) || !members.some(hidden)) return false;
  let rest = total.value!;
  for (const m of members) if (shows(m)) rest -= m.value!;
  return rest < SMALL_GROUP_MIN;
}

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
  if (!median && numeratorLeaks(crit, a.critical_within_target, true))
    return false;
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
    (numeratorLeaks(q.answers, q.needs_review_share, false) ||
      numeratorLeaks(q.reviews, q.agreement_rate, true))
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

const FEWER = /fewer than 5/gi;

/**
 * With a side hidden, the server's words must not give it away: they say
 * "fewer than 5" and carry no percentage (a change from a hidden number
 * works it out). With both hidden, no number at all beyond that phrase.
 */
function summarySafe(summary: string, previous: Guarded, current: Guarded) {
  const n = [previous, current].filter(hidden).length;
  if (n === 0) return true;
  if (!summary.match(FEWER) || summary.includes("%")) return false;
  return n === 1 || !/\d/.test(summary.replace(FEWER, ""));
}

/**
 * A change reads when its shape does. A side may be hidden (shown
 * "Fewer than 5", ranked unsized) when the summary doesn't give it away;
 * previous may be null: no previous period.
 */
function changeOk(c: unknown): c is Change {
  if (!isObj(c)) return false;
  if (typeof c.id !== "string" || !ID.test(c.id)) return false;
  if (!(c.hospital === null || isPerson(c.hospital))) return false;
  if (!CHANGE_AREAS.has(c.area as string)) return false;
  if (!MEASURE_IDS.has(c.measure as string)) return false;
  if (MEASURE_AREA[c.measure as Change["measure"]] !== c.area) return false;
  if (!DIRECTIONS.has(c.direction as string)) return false;
  if (typeof c.serious !== "boolean") return false;
  if (typeof c.summary !== "string" || c.summary.trim() === "") return false;
  if (!followUpOk(c.follow_up) || !isCount(c.version)) return false;
  const kind = MEASURE_KIND[c.measure as Change["measure"]];
  return (
    guardedOk(c.previous, kind, true) &&
    guardedOk(c.current, kind, true) &&
    summarySafe(c.summary, c.previous as Guarded, c.current as Guarded)
  );
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
