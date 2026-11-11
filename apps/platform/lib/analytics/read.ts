// Reading the analytics reply (spec §4, §5). The server computes and hides
// every number; this file checks it did, area by area, and fails an area
// closed ("Couldn't load {area}") rather than show a value it should have
// hidden, a wrong shape, or a What changed list the Critical guard can't
// vouch for. An area that fails never shows zeros and never takes the
// others down. It is strict (core openapi.yaml 1.15.0): an unknown key, a
// period start that isn't one of its kind, or a change on a hidden value
// fails the area too.
import { SMALL_GROUP_MIN } from "@mhai/ui/small-groups";
import {
  CHANGE_MEASURES,
  MEASURES,
  PERIODS,
  type AnalyticsOut,
  type AreaBlock,
  type Change,
  type Guarded,
  type HospitalSize,
  type MeasureId,
  type Period,
  type QualityRow,
  type UseRow,
} from "../api/analytics-contract";
import type { Person } from "../api/contract";
import { integrityNotificationOk } from "../audit/read";
import type { Notification } from "../api/notifications-contract";
import { rankChanges, type RankedChange } from "./changes";
import { MEASURE_AREA, MEASURE_KIND, type MeasureKind } from "./measures";
import { isPeriodStart, periodEnd, windowOk } from "./periods";
import {
  hasOnlyKeys,
  isHiddenValue as hidden,
  isId,
  isNum,
  isObj,
  isTime,
  shows,
  type Obj,
} from "@mhai/ui/guards";
import {
  usageGuardedOk,
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
/** Before the first published period of the kind: "First figures after …". */
export type NotYetState = {
  status: "not_yet";
  period: Period;
  first_from: string;
};
/** Alert safety while patient alerts don't exist (F4). */
export type OffState = { status: "off" };
export type AreaState<T> = ({ status: "ok" } & T) | Failed | NotYetState;
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
  /** The period kind, and the latest published one's start (null before it). */
  period: Period;
  from: string | null;
  changes: ({ status: "ok" } & ChangesBlock) | Failed;
  use: AreaState<AreaBlock<UseRow>>;
  /** Off while core sends `alerts: null` (F4); anything else fails closed. */
  alerts: Failed | OffState;
  quality: AreaState<AreaBlock<QualityRow>>;
  hospitals: AreaState<HospitalsBlock>;
};

const FAILED: Failed = { status: "failed" };
const HIDDEN: Guarded = { value: null, suppressed: true };
const DIRECTIONS = new Set(["worse", "better", "rising", "falling"]);
const MEASURE_IDS = new Set<string>(MEASURES);
const CHANGE_MEASURE_IDS = new Set<string>(CHANGE_MEASURES);

// ---- Shapes -------------------------------------------------------------------

/** Exactly these keys, all present: an extra key may carry a name or a number. */
const exactly = (o: Obj, keys: readonly string[]) =>
  hasOnlyKeys(o, keys) && keys.every((k) => Object.hasOwn(o, k));

const isPerson = (v: unknown): v is Person =>
  isObj(v) &&
  exactly(v, ["id", "name"]) &&
  typeof v.id === "string" &&
  isId(v.id) &&
  typeof v.name === "string" &&
  v.name.trim() !== "";

/**
 * A guarded value: exactly `{value, suppressed}`, hidden with no number, and
 * readable for its kind (a shown count is never 1–4).
 */
const guardedOk = (v: unknown, kind: MeasureKind, loose: boolean) =>
  isObj(v) &&
  exactly(v, ["value", "suppressed"]) &&
  (v.suppressed !== true || v.value === null) &&
  usageGuardedOk(v, kind, loose);

const UNAVAILABLE = (v: unknown) =>
  isObj(v) && exactly(v, ["unavailable"]) && v.unavailable === true;

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
  period: Period,
): b is AreaBlock<Rowish> {
  if (!isObj(b) || !exactly(b, ["updated_at", "rows", "median", "trend"]))
    return false;
  if (!isTime(b.updated_at)) return false;
  if (!Array.isArray(b.rows) || !isObj(b.median) || !Array.isArray(b.trend))
    return false;
  const rows = b.rows as unknown[];
  if (!rows.every((r) => isObj(r) && isPerson(r.hospital) && bodyOk(r, false)))
    return false;
  if (!uniqueHospitals(rows as { hospital: Person }[])) return false;
  if (!bodyOk(b.median, true)) return false;
  // A trend across all hospitals is a count (or a share) under the same
  // rule: hidden points read, an unhidden 1–4 is a leak.
  // One point per period of the kind, never a total over several.
  return (b.trend as unknown[]).every(
    (p) =>
      isObj(p) &&
      exactly(p, ["start", "value"]) &&
      isPeriodStart(period, p.start) &&
      guardedOk(p.value, trend, trend !== "count"),
  );
}

const USE_KEYS = ["questions", "active_clinicians", "questions_per_clinician"];
const QUALITY_KEYS = [
  "answers",
  "needs_review_share",
  "confidence",
  "reviews",
  "agreement_rate",
  "median_review_hours",
];
/** A row has its hospital and the body's keys; the median the body's only. */
const keysOk = (r: Obj, median: boolean, keys: string[]) =>
  exactly(r, median ? keys : ["hospital", ...keys]);

function useOk(r: Obj, median: boolean): boolean {
  if (!keysOk(r, median, USE_KEYS)) return false;
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

const CONFIDENCE = ["high", "medium", "low"] as const;

function qualityOk(r: Obj, median: boolean): boolean {
  if (!keysOk(r, median, QUALITY_KEYS)) return false;
  const mix = r.confidence;
  if (!isObj(mix) || !exactly(mix, CONFIDENCE)) return false;
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
  if (!isObj(h) || !exactly(h, ["updated_at", "rows"])) return false;
  if (!isTime(h.updated_at) || !Array.isArray(h.rows)) return false;
  const rows = h.rows as unknown[];
  return (
    rows.every(
      (r) =>
        isObj(r) &&
        exactly(r, ["hospital", "size"]) &&
        isPerson(r.hospital) &&
        isObj(r.size) &&
        exactly(r.size, ["staff", "active_clinicians", "questions"]) &&
        guardedOk(r.size.staff, "count", false) &&
        guardedOk(r.size.active_clinicians, "count", false) &&
        guardedOk(r.size.questions, "count", false),
    ) && uniqueHospitals(rows as { hospital: Person }[])
  );
}

const isVersion = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1;

function followUpOk(f: unknown): boolean {
  if (f === null) return true;
  return (
    isObj(f) &&
    exactly(f, ["by", "at", "note", "by_you", "version"]) &&
    isPerson(f.by) &&
    isTime(f.at) &&
    (f.note === null || typeof f.note === "string") &&
    typeof f.by_you === "boolean" &&
    isVersion(f.version)
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

const CHANGE_KEYS = [
  "id",
  "hospital",
  "area",
  "measure",
  "direction",
  "serious",
  "previous",
  "current",
  "summary",
  "follow_up",
  "version",
];
/** Both sides shown: a change is never flagged on a hidden value (T7). */
const shownSide = (g: unknown) =>
  isObj(g) && g.suppressed === false && isNum(g.value);

/**
 * A change reads when its shape does: one of core's measures, in its own
 * area, moving the measure's way (counts rise and fall, shares get worse
 * or better), with both sides shown.
 */
function changeOk(c: unknown): c is Change {
  if (!isObj(c) || !exactly(c, CHANGE_KEYS)) return false;
  if (!isId(c.id)) return false;
  if (!CHANGE_MEASURE_IDS.has(c.measure as string)) return false;
  if (!sidesOk(c)) return false;
  if (!shownSide(c.previous) || !shownSide(c.current)) return false;
  const m = c.measure as Change["measure"];
  if (MEASURE_AREA[m] !== c.area) return false;
  const counts = MEASURE_KIND[m] === "count";
  if (counts !== (c.direction === "rising" || c.direction === "falling"))
    return false;
  return followUpOk(c.follow_up) && isVersion(c.version);
}

function readChanges(
  c: unknown,
  alerts: AnalyticsState["alerts"],
): AnalyticsState["changes"] {
  // The Critical guard (anti-goal 2) has nothing to check while alerts are
  // not switched on (null, F4). Alerts sent any other way can't be vouched
  // for, so What changed fails closed rather than say "Nothing unusual".
  if (alerts.status !== "off") return FAILED;
  if (!isObj(c) || !exactly(c, ["updated_at", "window", "items"]))
    return FAILED;
  if (!isTime(c.updated_at)) return FAILED;
  const w = c.window;
  if (!isObj(w) || !exactly(w, ["from", "to"])) return FAILED;
  if (!isTime(w.from) || !isTime(w.to) || !windowOk({ from: w.from, to: w.to }))
    return FAILED;
  if (!Array.isArray(c.items) || !(c.items as unknown[]).every(changeOk))
    return FAILED;
  const items = c.items as Change[];
  if (new Set(items.map((x) => x.id)).size !== items.length) return FAILED;
  return {
    status: "ok",
    updated_at: c.updated_at,
    window: { from: w.from, to: w.to },
    items: rankChanges(scrub(items)),
  };
}

type Head = { period: Period; from: string | null };

/**
 * `{not_yet, first_from}` reads only before the first period (`from`
 * null), with `first_from` a period start of the kind; data reads only
 * after it.
 */
function notYet(b: unknown, head: Head): NotYetState | Failed | null {
  if (!isObj(b) || !("not_yet" in b)) return null;
  return head.from === null &&
    exactly(b, ["not_yet", "first_from"]) &&
    b.not_yet === true &&
    isPeriodStart(head.period, b.first_from)
    ? {
        status: "not_yet",
        period: head.period,
        first_from: b.first_from as string,
      }
    : FAILED;
}

function area<R>(
  b: unknown,
  head: Head,
  bodyOk: (r: Obj, median: boolean) => boolean,
  trend: MeasureKind,
): AreaState<AreaBlock<R>> {
  const ny = notYet(b, head);
  if (ny) return ny;
  if (head.from === null || !blockOk(b, bodyOk, trend, head.period))
    return FAILED;
  return { status: "ok", ...(scrub(b) as unknown as AreaBlock<R>) };
}

const TOP_KEYS = [
  "period",
  "from",
  "to",
  "changes",
  "use",
  "alerts",
  "quality",
  "hospitals",
  "what_changed",
];

/**
 * The reply's head: exactly its keys, the kind asked for, `from`/`to` the
 * bounds of one period of that kind (or both null), and `changes`
 * unavailable (What changed is `what_changed`, F21). Null: none of it reads.
 */
function headOf(x: Obj, asked?: Period): Head | null {
  if (!exactly(x, TOP_KEYS)) return null;
  const period = x.period as Period;
  if (!PERIODS.includes(period) || (asked && period !== asked)) return null;
  if (!UNAVAILABLE(x.changes)) return null;
  if (x.from === null && x.to === null) return { period, from: null };
  if (!isPeriodStart(period, x.from) || typeof x.to !== "string") return null;
  const from = x.from as string;
  if (Date.parse(x.to) !== periodEnd(period, Date.parse(from))) return null;
  return { period, from };
}

/** Each area read on its own; see the file comment. */
export function readAnalytics(a: AnalyticsOut, asked?: Period): AnalyticsState {
  const x: Obj = isObj(a) ? a : {};
  const head = headOf(x, asked);
  if (!head)
    return {
      period: asked ?? "month",
      from: null,
      changes: FAILED,
      use: FAILED,
      alerts: FAILED,
      quality: FAILED,
      hospitals: FAILED,
    };
  const alerts: AnalyticsState["alerts"] =
    x.alerts === null ? { status: "off" } : FAILED;
  const ny = notYet(x.hospitals, head);
  return {
    ...head,
    changes: readChanges(x.what_changed, alerts),
    use: area<UseRow>(x.use, head, useOk, "count"),
    alerts,
    quality: area<QualityRow>(x.quality, head, qualityOk, "share"),
    hospitals:
      ny ??
      (head.from !== null && hospitalsOk(x.hospitals)
        ? { status: "ok", ...scrub(x.hospitals) }
        : FAILED),
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
      /** Null: a change across all hospitals (no median, F14). */
      hospital: Person | null;
      points: SeriesPoint[];
    }
  | Failed;

/**
 * Reads a compare-chart reply for the measure and period kind the app asked
 * for: a change's series (with its `change_id`, and a null hospital for a
 * change across all hospitals) or a hospital's. It fails closed on a wrong
 * shape or key, a different measure or change, a point that doesn't start
 * a period of the kind, or a count sent unhidden between 0 and 5. A count
 * median between 0 and 5 is hidden: no mark, not in the scale, "Fewer
 * than 5" in words.
 */
export function readSeries(
  s: unknown,
  measure: MeasureId,
  period: Period,
  changeId?: string,
): SeriesState {
  if (!isObj(s) || s.measure !== measure) return FAILED;
  if (changeId === undefined) {
    if (!exactly(s, ["measure", "hospital", "points"])) return FAILED;
    if (!isPerson(s.hospital)) return FAILED;
  } else {
    if (!exactly(s, ["change_id", "measure", "hospital", "points"]))
      return FAILED;
    if (s.change_id !== changeId) return FAILED;
    if (s.hospital !== null && !isPerson(s.hospital)) return FAILED;
  }
  if (!Array.isArray(s.points)) return FAILED;
  const kind = MEASURE_KIND[measure];
  const points: SeriesPoint[] = [];
  for (const p of s.points as unknown[]) {
    if (!isObj(p) || !exactly(p, ["start", "value", "median"])) return FAILED;
    if (!isPeriodStart(period, p.start)) return FAILED;
    // `{value: null, suppressed: false}`: the period doesn't list it.
    if (!guardedOk(p.value, kind, true)) return FAILED;
    if (s.hospital === null && p.median !== null) return FAILED;
    const m = p.median;
    if (m !== null && (!isNum(m) || m < 0)) return FAILED;
    points.push({
      start: p.start as string,
      value: scrub(p.value as Guarded),
      median:
        m === null
          ? null
          : kind === "count" && m > 0 && m < SMALL_GROUP_MIN
            ? HIDDEN
            : { value: m, suppressed: false },
    });
  }
  const h = s.hospital as Person | null;
  return {
    status: "ok",
    measure,
    hospital: h && { id: h.id, name: h.name },
    points,
  };
}
