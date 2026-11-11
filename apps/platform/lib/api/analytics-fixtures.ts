// The platform demo's sample analytics: counts only, made up, and guarded
// by the small-group rule as the backend does it (backend spec §5–§7), so
// the demo never sends a value the app must refuse. Figures exist only per
// finished calendar period (R41a): month-aligned weeks, months, quarters.
// Every hospital and person is invented. No patient data, nothing per
// person.
import { finishedPeriods, periodEnd, periodOf } from "../analytics/periods";
import type {
  AnalyticsOut,
  Change,
  GuardrailPeriodsOut,
  GuardrailRates,
  Guarded,
  MeasureId,
  Period,
  QualityRow,
  SeriesOut,
  UseRow,
} from "./analytics-contract";
import type { Person } from "./contract";

/**
 * "normal": the demo. "unavailable": every area fails. "not_yet": before
 * the first published period of every kind (F19). Only active hospitals
 * appear.
 */
export type AnalyticsMode = "normal" | "unavailable" | "not_yet";

const DAY = 86_400_000;
const MIN = 60_000;
/** Periods in a trend or series: 12 weeks, 12 months, 8 quarters. */
const SERIES_LENGTH: Record<Period, number> = {
  week: 12,
  month: 12,
  quarter: 8,
};
/** How long after a period ends its snapshot is stored. */
const COMPUTED_AFTER = 20 * MIN;
const iso = (ms: number) => new Date(ms).toISOString();

const person = (id: string, name: string): Person => ({ id, name });
const HAVANA = person("h_havana", "Havana Hospital");
const NORTHGATE = person("h_northgate", "Northgate General Hospital");
const RIVERSIDE = person("h_riverside", "Riverside Children's Hospital");
const LAKESIDE = person("h_lakeside", "Lakeside Community Clinic");
const HILLTOP = person("h_hilltop", "Hilltop Cottage Hospital");
const TUNDE = person("tm_tunde", "Tunde Okafor");

/** A hospital's level per day. Shares are from 0 to 1. */
type Daily = {
  questions: number;
  /** Escalated: the low-confidence share, which needs review. */
  needs_review: number;
  high: number;
  /** The share of answers a reviewer looked at. */
  reviewed: number;
  agreement: number;
  review_hours: number;
  degraded: number;
};
type Profile = {
  hospital: Person;
  staff: number;
  /** Active clinicians in a week, a month and a quarter. */
  clinicians: Record<Period, number>;
  /** Before the latest finished week. */
  previous: Daily;
  /** From the latest finished week on, where they differ. */
  current: Partial<Daily>;
  /** Listed from the start of the latest finished month (a new hospital). */
  isNew?: boolean;
  /** Seed for the day-to-day wobble. */
  seed: number;
};

const NONE: Daily = {
  questions: 0,
  needs_review: 0,
  high: 0,
  reviewed: 0,
  agreement: 0,
  review_hours: 0,
  degraded: 0,
};

/** In list order. Havana is healthy; each other one proves a rule. */
const PROFILES: Profile[] = [
  {
    hospital: HAVANA,
    staff: 186,
    clinicians: { week: 52, month: 61, quarter: 66 },
    previous: {
      questions: 34,
      needs_review: 0.26,
      high: 0.56,
      reviewed: 0.2,
      agreement: 0.72,
      review_hours: 30,
      degraded: 0.02,
    },
    // Fewer answers need review, and reviewers agree more.
    current: { needs_review: 0.08, high: 0.7, agreement: 0.9 },
    seed: 1,
  },
  {
    hospital: NORTHGATE,
    staff: 214,
    clinicians: { week: 64, month: 78, quarter: 84 },
    previous: {
      questions: 43,
      needs_review: 0.12,
      high: 0.62,
      reviewed: 0.15,
      agreement: 0.86,
      review_hours: 20,
      degraded: 0.03,
    },
    // More questions, and more answers need review.
    current: { questions: 69, needs_review: 0.31, high: 0.45 },
    seed: 2,
  },
  {
    hospital: RIVERSIDE,
    staff: 96,
    clinicians: { week: 31, month: 38, quarter: 41 },
    previous: {
      questions: 20,
      needs_review: 0.1,
      high: 0.66,
      reviewed: 0.1,
      agreement: 0.88,
      review_hours: 26,
      degraded: 0.02,
    },
    // Questions down (140 → 83 a week).
    current: { questions: 83 / 7 },
    seed: 3,
  },
  {
    // A small hospital: its weekly counts are 1–4, so they are hidden.
    hospital: LAKESIDE,
    staff: 23,
    clinicians: { week: 1, month: 2, quarter: 3 },
    previous: {
      questions: 0.3,
      needs_review: 0.2,
      high: 0.5,
      reviewed: 0.2,
      agreement: 0.8,
      review_hours: 40,
      degraded: 0,
    },
    current: {},
    seed: 7,
  },
  {
    // New this month, nobody asking yet: zeros, which show as 0, and no
    // previous month to compare with.
    hospital: HILLTOP,
    staff: 12,
    clinicians: { week: 0, month: 0, quarter: 0 },
    previous: NONE,
    current: {},
    isNew: true,
    seed: 8,
  },
];

/** The latest finished week, and the month that finished before it began. */
function changeWindow(now: number) {
  const week = finishedPeriods("week", now, 1)[0]!;
  const month = periodOf("month", periodOf("month", week.from) - 1);
  return { week, month };
}

/**
 * What changed: the latest week against the month before it, per day,
 * from shown values only. Ids stay while a change lasts. The summary is
 * core's: the two values and no hospital name.
 */
export function seedChanges(now: number, mode: AnalyticsMode): Change[] {
  if (mode === "not_yet") return [];
  const g = (value: number): Guarded => ({ value, suppressed: false });
  const { week } = changeWindow(now);
  return [
    {
      id: "chg_ngh_needs_review",
      hospital: NORTHGATE,
      area: "quality",
      measure: "needs_review_share",
      direction: "worse",
      serious: false,
      previous: g(0.12),
      current: g(0.31),
      summary: "Answers needing review worse: 12.00% to 31.00%",
      follow_up: null,
      version: 1,
    },
    {
      id: "chg_ngh_questions",
      hospital: NORTHGATE,
      area: "use",
      measure: "questions",
      direction: "rising",
      serious: false,
      previous: g(301),
      current: g(483),
      summary: "Questions up: 301 to 483 a week",
      follow_up: null,
      version: 1,
    },
    {
      id: "chg_hav_needs_review",
      hospital: HAVANA,
      area: "quality",
      measure: "needs_review_share",
      direction: "better",
      serious: false,
      previous: g(0.26),
      current: g(0.08),
      summary: "Answers needing review better: 26.00% to 8.00%",
      follow_up: null,
      version: 1,
    },
    {
      id: "chg_all_questions",
      hospital: null,
      area: "use",
      measure: "questions",
      direction: "rising",
      serious: false,
      previous: g(680.4),
      current: g(1031),
      summary: "Questions up: 680.4 to 1031 a week",
      follow_up: null,
      version: 1,
    },
    {
      id: "chg_hav_agreement",
      hospital: HAVANA,
      area: "quality",
      measure: "agreement_rate",
      direction: "better",
      serious: false,
      previous: g(0.72),
      current: g(0.9),
      summary: "Agreement rate better: 72.00% to 90.00%",
      follow_up: null,
      version: 1,
    },
    {
      id: "chg_rch_questions",
      hospital: RIVERSIDE,
      area: "use",
      measure: "questions",
      direction: "falling",
      serious: false,
      previous: g(140),
      current: g(83),
      summary: "Questions down: 140 to 83 a week",
      follow_up: {
        by: TUNDE,
        by_you: false,
        // After the week was evaluated.
        at: iso(week.to + DAY),
        note: "Called Musa Danjuma: two wards changed their rota. Checking again next week.",
        version: 1,
      },
      version: 2,
    },
  ];
}

/** When each change was first flagged, in minutes after its week ended. */
const FLAGGED_AFTER_MIN: Record<string, number> = {
  chg_ngh_needs_review: 40,
  chg_ngh_questions: 40,
  chg_hav_needs_review: 40,
  chg_all_questions: 40,
  chg_hav_agreement: 40,
  // An older change, flagged again each week since.
  chg_rch_questions: -7 * 24 * 60 + 40,
};
/** When a change was first flagged. */
export function changeFlaggedAt(id: string, now: number): string {
  const { week } = changeWindow(now);
  return iso(week.to + (FLAGGED_AFTER_MIN[id] ?? 40) * MIN);
}

// ---- The small-group rule -------------------------------------------------

const HIDDEN: Guarded = { value: null, suppressed: true };
const NOTHING: Guarded = { value: null, suppressed: false };
/** Shares to 4 places, as core sends them. */
const SHARE_DP = 4;
const small = (n: number) => n >= 1 && n <= 4;
/** A count: 1–4 is hidden, 0 shows. */
const count = (n: number): Guarded =>
  small(n) ? HIDDEN : { value: n, suppressed: false };
/** A rate over counts: hidden when any of them is; nothing to show over 0. */
function over(
  value: number,
  deps: Guarded[],
  denominator: number,
  dp = 0,
): Guarded {
  if (deps.some((d) => d.suppressed)) return HIDDEN;
  if (denominator === 0) return NOTHING;
  const f = 10 ** dp;
  return { value: Math.round(value * f) / f, suppressed: false };
}
/** A set that adds up: one hidden member hides the whole set. */
function set<K extends string>(
  members: Record<K, Guarded>,
): Record<K, Guarded> {
  const vals = Object.values(members) as Guarded[];
  if (!vals.some((g) => g.suppressed)) return members;
  return Object.fromEntries(
    Object.keys(members).map((k) => [k, HIDDEN]),
  ) as Record<K, Guarded>;
}

// ---- Days and sums -----------------------------------------------------------

/** Base counts over one period, plus the weights for the averaged levels. */
type Raw = {
  questions: number;
  clinicians: number;
  answers: number;
  needs_review: number;
  high: number;
  medium: number;
  low: number;
  degraded: number;
  reviews: number;
  agreed: number;
  review_hours: number;
};

/** The start of today, UTC: day `k` starts (k + 1) days before it. */
const today = (now: number) => Math.floor(now / DAY) * DAY;

function sumPeriod(
  p: Profile,
  kind: Period,
  span: { from: number; to: number },
  now: number,
): Raw {
  const T = today(now);
  const currentFrom = finishedPeriods("week", now, 1)[0]!.from;
  const s = {
    questions: 0,
    answers: 0,
    needs_review: 0,
    high: 0,
    degraded: 0,
    reviews: 0,
    agreed: 0,
    hours: 0,
  };
  for (let t = span.from; t < span.to; t += DAY) {
    const L: Daily =
      t >= currentFrom ? { ...p.previous, ...p.current } : p.previous;
    const k = (T - t) / DAY;
    const w = 1 + 0.12 * Math.sin(k * 1.3 + p.seed);
    const v = 1 + 0.05 * Math.sin(k * 0.7 + p.seed * 2);
    const questions = L.questions * w;
    const answers = questions * 0.97;
    const reviews = answers * L.reviewed;
    s.questions += questions;
    s.answers += answers;
    s.needs_review += answers * L.needs_review;
    s.high += answers * L.high;
    s.degraded += answers * L.degraded;
    s.reviews += reviews;
    s.agreed += reviews * L.agreement;
    s.hours += L.review_hours * v * reviews;
  }
  const r = Math.round;
  const questions = r(s.questions);
  const answers = Math.min(questions, r(s.answers));
  const high = Math.min(answers, r(s.high));
  const low = Math.min(answers - high, r(s.needs_review));
  const reviews = Math.min(answers, r(s.reviews));
  return {
    questions,
    clinicians: questions === 0 ? 0 : p.clinicians[kind],
    answers,
    needs_review: low,
    high,
    medium: answers - high - low,
    low,
    degraded: Math.min(answers, r(s.degraded)),
    reviews,
    agreed: Math.min(reviews, r(s.agreed)),
    review_hours: s.reviews ? s.hours / s.reviews : 0,
  };
}

/** Whether a period lists the hospital (a new one only from its month). */
function lists(p: Profile, span: { to: number }, now: number): boolean {
  if (!p.isNew) return true;
  return span.to > finishedPeriods("month", now, 1)[0]!.from;
}

// ---- Rows ------------------------------------------------------------------

type Body<R> = Omit<R, "hospital">;

function toUseRow(x: Raw): Body<UseRow> {
  const questions = count(x.questions);
  const active_clinicians = count(x.clinicians);
  return {
    questions,
    active_clinicians,
    questions_per_clinician: over(
      x.questions / (x.clinicians || 1),
      [questions, active_clinicians],
      x.clinicians,
      2,
    ),
  };
}

function toQualityRow(x: Raw): Body<QualityRow> {
  const answers = count(x.answers);
  const reviews = count(x.reviews);
  return {
    answers,
    needs_review_share: over(
      x.needs_review / (x.answers || 1),
      [answers, count(x.needs_review), count(x.answers - x.needs_review)],
      x.answers,
      SHARE_DP,
    ),
    confidence: set({
      high: count(x.high),
      medium: count(x.medium),
      low: count(x.low),
    }),
    reviews,
    // Hidden when the reviews that agreed or disagreed are 1–4.
    agreement_rate: over(
      x.agreed / (x.reviews || 1),
      [reviews, count(x.agreed), count(x.reviews - x.agreed)],
      x.reviews,
      SHARE_DP,
    ),
    // Shown only for 5 or more reviews (core: corrections decided).
    median_review_hours:
      x.reviews >= 5
        ? { value: Math.round(x.review_hours * 10) / 10, suppressed: false }
        : HIDDEN,
  };
}

// ---- Medians -----------------------------------------------------------------

/** The median of the values that show; null when none do. */
function median(gs: Guarded[]): number | null {
  const v = gs
    .filter((g) => !g.suppressed && g.value !== null)
    .map((g) => g.value!)
    .sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}
/** A count median strictly between 0 and 5 is hidden. */
const medCount = (gs: Guarded[]): Guarded => {
  const m = median(gs);
  if (m === null) return NOTHING;
  return m > 0 && m < 5 ? HIDDEN : { value: m, suppressed: false };
};
const medRate = (gs: Guarded[], dp: number): Guarded => {
  const m = median(gs);
  if (m === null) return NOTHING;
  const f = 10 ** dp;
  return { value: Math.round(m * f) / f, suppressed: false };
};

function toUseMedian(rows: Body<UseRow>[]): Body<UseRow> {
  return {
    questions: medCount(rows.map((r) => r.questions)),
    active_clinicians: medCount(rows.map((r) => r.active_clinicians)),
    questions_per_clinician: medRate(
      rows.map((r) => r.questions_per_clinician),
      2,
    ),
  };
}
function toQualityMedian(rows: Body<QualityRow>[]): Body<QualityRow> {
  return {
    answers: medCount(rows.map((r) => r.answers)),
    needs_review_share: medRate(
      rows.map((r) => r.needs_review_share),
      SHARE_DP,
    ),
    confidence: {
      high: medCount(rows.map((r) => r.confidence.high)),
      medium: medCount(rows.map((r) => r.confidence.medium)),
      low: medCount(rows.map((r) => r.confidence.low)),
    },
    reviews: medCount(rows.map((r) => r.reviews)),
    agreement_rate: medRate(
      rows.map((r) => r.agreement_rate),
      SHARE_DP,
    ),
    median_review_hours: medRate(
      rows.map((r) => r.median_review_hours),
      1,
    ),
  };
}

// ---- One period across all hospitals ---------------------------------------

/**
 * The all-hospitals cell of one measure in one period. Hidden when any
 * listed hospital's own cell is: the sample data's stand-in for core's
 * bridge check, so the total minus the shown hospitals never gives a
 * hidden one away.
 */
function allCell(
  measure: MeasureId,
  kind: Period,
  span: { from: number; to: number },
  now: number,
): Guarded {
  const listed = PROFILES.filter((p) => lists(p, span, now));
  const xs = listed.map((p) => sumPeriod(p, kind, span, now));
  if (xs.some((x) => pick(measure, x).suppressed)) return HIDDEN;
  const all = { ...xs[0]! };
  for (const k of Object.keys(all) as (keyof Raw)[])
    all[k] = xs.reduce((a, x) => a + x[k], 0);
  return pick(measure, all);
}

/** One measure from a period's sums, under the same rules as the rows. */
function pick(measure: MeasureId, x: Raw): Guarded {
  switch (measure) {
    case "questions_per_clinician":
      return toUseRow(x).questions_per_clinician;
    case "questions":
      return toUseRow(x).questions;
    case "active_clinicians":
      return toUseRow(x).active_clinicians;
    case "needs_review_share":
      return toQualityRow(x).needs_review_share;
    case "agreement_rate":
      return toQualityRow(x).agreement_rate;
    case "median_review_hours":
      return toQualityRow(x).median_review_hours;
    default:
      // Alert measures: no patient alerts in the backend yet.
      return NOTHING;
  }
}

// ---- The replies -------------------------------------------------------------

export function isAnalyticsHospital(id: string): boolean {
  return PROFILES.some((p) => p.hospital.id === id);
}

/** The first period of a kind that will be published (the next one). */
const firstFrom = (kind: Period, now: number) =>
  iso(periodEnd(kind, periodOf(kind, now)));

export function buildAnalytics(
  period: Period,
  now: number,
  mode: AnalyticsMode,
  changes: Change[],
): AnalyticsOut {
  const no = { unavailable: true } as const;
  if (mode === "not_yet") {
    const ny = { not_yet: true, first_from: firstFrom(period, now) } as const;
    return {
      period,
      from: null,
      to: null,
      changes: no,
      use: ny,
      alerts: null,
      quality: ny,
      hospitals: ny,
      what_changed: no,
    };
  }
  const spans = finishedPeriods(period, now, SERIES_LENGTH[period]);
  const latest = spans.at(-1)!;
  const head = {
    period,
    from: iso(latest.from),
    to: iso(latest.to),
    changes: no,
    alerts: null,
  };
  if (mode === "unavailable")
    return {
      ...head,
      use: no,
      quality: no,
      hospitals: no,
      what_changed: no,
    };
  const listed = PROFILES.filter((p) => lists(p, latest, now));
  const raws = listed.map((p) => sumPeriod(p, period, latest, now));
  const rows = <R>(make: (x: Raw) => Body<R>) =>
    raws.map((x, i) => ({ hospital: listed[i]!.hospital, ...make(x) }) as R);
  const use = rows<UseRow>(toUseRow);
  const quality = rows<QualityRow>(toQualityRow);
  const updated_at = iso(latest.to + COMPUTED_AFTER);
  const trend = (m: MeasureId) =>
    spans.map((s) => ({
      start: iso(s.from),
      value: allCell(m, period, s, now),
    }));
  const { week, month } = changeWindow(now);
  return {
    ...head,
    use: {
      updated_at,
      rows: use,
      median: toUseMedian(use),
      trend: trend("questions"),
    },
    quality: {
      updated_at,
      rows: quality,
      median: toQualityMedian(quality),
      trend: trend("needs_review_share"),
    },
    hospitals: {
      updated_at,
      rows: listed.map((p, i) => ({
        hospital: p.hospital,
        size: {
          staff: count(p.staff),
          active_clinicians: use[i]!.active_clinicians,
          questions: use[i]!.questions,
        },
      })),
    },
    what_changed: {
      updated_at: iso(week.to + 30 * MIN),
      window: { from: iso(month), to: iso(week.to) },
      items: structuredClone(changes),
    },
  };
}

/**
 * One measure for one hospital (or all of them, with `hospitalId` null)
 * over the latest periods of the kind, with the median of the other
 * hospitals' shown values. A count median strictly between 0 and 5 is
 * null; a period that doesn't list the hospital is `{null, false}`.
 */
export function buildSeries(
  hospitalId: string | null,
  measure: MeasureId,
  period: Period,
  now: number,
  changeId?: string,
): SeriesOut {
  const self = PROFILES.find((p) => p.hospital.id === hospitalId) ?? null;
  const counts = measure === "questions" || measure === "active_clinicians";
  const points = finishedPeriods(period, now, SERIES_LENGTH[period]).map(
    (s) => {
      const start = iso(s.from);
      if (!self)
        return { start, value: allCell(measure, period, s, now), median: null };
      if (!lists(self, s, now)) return { start, value: NOTHING, median: null };
      const others = PROFILES.filter((p) => p !== self && lists(p, s, now));
      let med = median(
        others.map((p) => pick(measure, sumPeriod(p, period, s, now))),
      );
      if (med !== null) {
        med = Math.round(med * 10_000) / 10_000;
        if (counts && med > 0 && med < 5) med = null;
      }
      return {
        start,
        value: pick(measure, sumPeriod(self, period, s, now)),
        median: med,
      };
    },
  );
  return {
    ...(changeId ? { change_id: changeId } : {}),
    measure,
    hospital: self?.hospital ?? null,
    points,
  };
}

function rates(x: Raw): GuardrailRates {
  const answers = count(x.answers);
  const parts = set({
    pass: count(x.high),
    regenerate: count(x.medium),
    escalate: count(x.low),
  });
  const share = (n: number, part: Guarded) =>
    over(
      n / (x.answers || 1),
      [answers, part, count(x.answers - n)],
      x.answers,
      SHARE_DP,
    );
  return {
    answers,
    ...parts,
    degraded:
      answers.suppressed || small(x.answers - x.degraded)
        ? HIDDEN
        : count(x.degraded),
    pass_share: share(x.high, parts.pass),
    regenerate_share: share(x.medium, parts.regenerate),
    escalate_share: share(x.low, parts.escalate),
  };
}

/**
 * Guardrail statistics for the latest finished period (F20). Before the
 * first one, or with the areas failing, it is 503 `not_ready` (the caller
 * throws). `all` is hidden cell by cell where a hospital's is.
 */
export function buildGuardrails(
  period: Period,
  now: number,
): GuardrailPeriodsOut {
  const latest = finishedPeriods(period, now, 1)[0]!;
  const listed = PROFILES.filter((p) => lists(p, latest, now));
  const raws = listed.map((p) => sumPeriod(p, period, latest, now));
  const hospitals = raws.map((x, i) => ({
    hospital: listed[i]!.hospital,
    ...rates(x),
  }));
  const total = { ...raws[0]! };
  for (const k of Object.keys(total) as (keyof Raw)[])
    total[k] = raws.reduce((a, x) => a + x[k], 0);
  const all = rates(total);
  for (const k of Object.keys(all) as (keyof GuardrailRates)[])
    if (hospitals.some((h) => h[k].suppressed)) all[k] = HIDDEN;
  return {
    period,
    from: iso(latest.from),
    to: iso(latest.to),
    updated_at: iso(latest.to + COMPUTED_AFTER),
    all,
    hospitals,
  };
}
