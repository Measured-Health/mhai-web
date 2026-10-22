// The platform demo's sample analytics: counts only, made up, and guarded
// by the small-group rule exactly as the backend does it (spec §5), so the
// demo never sends a value the app must refuse. Every hospital and person
// is invented. No patient data, nothing per person.
import type {
  AlertsRow,
  AnalyticsOut,
  Change,
  Guarded,
  MeasureId,
  Period,
  QualityRow,
  SeriesOut,
  UseRow,
} from "./analytics-contract";
import type { Person } from "./contract";

/**
 * "normal": the demo. "guard": Northgate's serious change is gone while its
 * unhandled Critical alerts past target (hidden as fewer than 5) stay, which
 * the app must refuse to show as "Nothing unusual". "unavailable": every
 * area fails. Only active hospitals appear.
 */
export type AnalyticsMode = "normal" | "guard" | "unavailable";

const DAY = 86_400_000;
const MIN = 60_000;
const DAYS: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90 };
/** What changed always compares the last 7 days with the 4 weeks before. */
const WINDOW_DAYS = 7;
const CRITICAL_TARGET_MINUTES = 15;
const iso = (ms: number) => new Date(ms).toISOString();

const person = (id: string, name: string): Person => ({ id, name });
const HAVANA = person("h_havana", "Havana Hospital");
const NORTHGATE = person("h_northgate", "Northgate General Hospital");
const RIVERSIDE = person("h_riverside", "Riverside Children's Hospital");
const LAKESIDE = person("h_lakeside", "Lakeside Community Clinic");
const HILLTOP = person("h_hilltop", "Hilltop Cottage Hospital");
const TUNDE = person("tm_tunde", "Tunde Okafor");
/** The series of a change across all hospitals. */
const ALL_HOSPITALS = person("all", "All hospitals");

/** A hospital's level per day. Shares are from 0 to 1. */
type Daily = {
  questions: number;
  critical: number;
  urgent: number;
  info: number;
  /** Alerts raised that day that are still unhandled. */
  unhandled: number;
  ack_minutes: number;
  critical_ack_minutes: number;
  critical_within: number;
  needs_review: number;
  high: number;
  medium: number;
  /** The share of answers a reviewer looked at. */
  reviewed: number;
  agreement: number;
  review_hours: number;
};
type Profile = {
  hospital: Person;
  staff: number;
  /** Active clinicians over 1, 7, 30 and 90 days. */
  clinicians: [number, number, number, number];
  /** Before the last 7 days. */
  previous: Daily;
  /** The last 7 days, where they differ. */
  current: Partial<Daily>;
  /** Unhandled Critical alerts past target, now. */
  overdue: number;
  /** Seed for the day-to-day wobble. */
  seed: number;
};

const NONE: Daily = {
  questions: 0,
  critical: 0,
  urgent: 0,
  info: 0,
  unhandled: 0,
  ack_minutes: 0,
  critical_ack_minutes: 0,
  critical_within: 0,
  needs_review: 0,
  high: 0,
  medium: 0,
  reviewed: 0,
  agreement: 0,
  review_hours: 0,
};

/** In list order. Havana is healthy; each other one proves a rule. */
const PROFILES: Profile[] = [
  {
    hospital: HAVANA,
    staff: 186,
    clinicians: [24, 52, 61, 66],
    previous: {
      questions: 34,
      critical: 6,
      urgent: 9,
      info: 15,
      unhandled: 0,
      ack_minutes: 11,
      critical_ack_minutes: 6,
      critical_within: 0.95,
      needs_review: 0.08,
      high: 0.7,
      medium: 0.22,
      reviewed: 0.2,
      agreement: 0.9,
      review_hours: 30,
    },
    // Reviews got faster; Low potassium alerts rose here too.
    current: { review_hours: 14, urgent: 11 },
    overdue: 0,
    seed: 1,
  },
  {
    hospital: NORTHGATE,
    staff: 214,
    clinicians: [30, 64, 78, 84],
    previous: {
      questions: 55,
      critical: 6.5,
      urgent: 9,
      info: 16,
      unhandled: 0.9,
      ack_minutes: 14,
      critical_ack_minutes: 18,
      critical_within: 0.9,
      needs_review: 0.12,
      high: 0.62,
      medium: 0.26,
      reviewed: 0.15,
      agreement: 0.86,
      review_hours: 20,
    },
    // Critical acknowledged 2× slower; more answers need review.
    current: {
      critical_ack_minutes: 36,
      critical_within: 0.55,
      needs_review: 0.21,
      urgent: 11,
    },
    // 3 past target (hidden as fewer than 5): the serious change covers it.
    overdue: 3,
    seed: 2,
  },
  {
    hospital: RIVERSIDE,
    staff: 96,
    clinicians: [12, 31, 38, 41],
    previous: {
      questions: 20,
      critical: 2,
      urgent: 4,
      info: 7,
      unhandled: 0.2,
      ack_minutes: 12,
      critical_ack_minutes: 8,
      critical_within: 0.93,
      needs_review: 0.1,
      high: 0.66,
      medium: 0.24,
      reviewed: 0.1,
      agreement: 0.88,
      review_hours: 26,
    },
    // Questions down 41% (140 → 83 a week).
    current: { questions: 83 / 7, urgent: 5 },
    overdue: 0,
    seed: 3,
  },
  {
    // A small hospital: its counts are 1–4, so they are hidden.
    hospital: LAKESIDE,
    staff: 23,
    clinicians: [1, 1, 2, 3],
    previous: {
      questions: 0.12,
      critical: 0.01,
      urgent: 0.03,
      info: 0.05,
      unhandled: 0.02,
      ack_minutes: 30,
      critical_ack_minutes: 20,
      critical_within: 0.7,
      needs_review: 0.2,
      high: 0.5,
      medium: 0.3,
      reviewed: 0.2,
      agreement: 0.8,
      review_hours: 40,
    },
    current: {},
    overdue: 0,
    seed: 7,
  },
  {
    // Active since 9 days ago, nobody asking yet: zeros, which show as 0,
    // and no previous period.
    hospital: HILLTOP,
    staff: 12,
    clinicians: [0, 0, 0, 0],
    previous: NONE,
    current: {},
    overdue: 0,
    seed: 8,
  },
];

/** The changes in the fixed window; ids are stable. */
export function seedChanges(now: number, mode: AnalyticsMode): Change[] {
  const g = (value: number | null): Guarded => ({ value, suppressed: false });
  const all: Change[] = [
    {
      id: "chg_ngh_critical_ack",
      hospital: NORTHGATE,
      area: "alerts",
      measure: "critical_median_ack_minutes",
      direction: "worse",
      serious: true,
      previous: g(18),
      current: g(36),
      summary:
        "Northgate General Hospital: Critical alerts acknowledged 2× slower (18 → 36 min)",
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
      summary:
        "Riverside Children's Hospital: questions down 41% (140 → 83 a week)",
      follow_up: {
        by: TUNDE,
        by_you: false,
        at: iso(now - DAY),
        note: "Called Musa Danjuma: two wards changed their rota. Checking again next week.",
        version: 1,
      },
      version: 2,
    },
    {
      id: "chg_all_low_potassium",
      hospital: null,
      area: "alerts",
      measure: "alerts_total",
      direction: "rising",
      serious: false,
      previous: g(48),
      current: g(83),
      summary: "All hospitals: Low potassium alerts rising (48 → 83 a week)",
      follow_up: null,
      version: 1,
    },
    {
      id: "chg_ngh_needs_review",
      hospital: NORTHGATE,
      area: "quality",
      measure: "needs_review_share",
      direction: "worse",
      serious: false,
      previous: g(0.12),
      current: g(0.21),
      summary:
        "Northgate General Hospital: more answers need review (12% → 21%)",
      follow_up: null,
      version: 1,
    },
    {
      id: "chg_hav_review_time",
      hospital: HAVANA,
      area: "quality",
      measure: "median_review_hours",
      direction: "better",
      serious: false,
      previous: g(30),
      current: g(14),
      summary: "Havana Hospital: answers reviewed faster (30 → 14 hours)",
      follow_up: null,
      version: 1,
    },
    {
      id: "chg_hch_clinicians",
      hospital: HILLTOP,
      area: "use",
      measure: "active_clinicians",
      direction: "worse",
      serious: false,
      // A new hospital: nothing earlier to compare with.
      previous: g(null),
      current: g(0),
      summary:
        "Hilltop Cottage Hospital: no clinicians active yet, 9 days after it started",
      follow_up: null,
      version: 1,
    },
  ];
  return mode === "guard" ? all.filter((c) => !c.serious) : all;
}

// ---- The small-group rule -------------------------------------------------

const HIDDEN: Guarded = { value: null, suppressed: true };
/**
 * Shares to 4 places, so the numbers they're over can be worked out
 * exactly enough for the app's own check (the reader refuses a share whose
 * numerator, or its complement, comes to 1–4).
 */
const SHARE_DP = 4;
const small = (n: number) => n >= 1 && n <= 4;
/** A count: 1–4 is hidden, 0 shows. */
const count = (n: number): Guarded =>
  small(n) ? HIDDEN : { value: n, suppressed: false };
/**
 * A rate over counts (its numerator and denominator): hidden when any of
 * them is; nothing to show over 0.
 */
function over(
  value: number,
  deps: Guarded[],
  denominator: number,
  dp = 0,
): Guarded {
  if (deps.some((d) => d.suppressed)) return HIDDEN;
  if (denominator === 0) return { value: null, suppressed: false };
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

// ---- Days, buckets and sums -----------------------------------------------

/** Counts, plus the weights for the averaged levels. */
type Raw = {
  questions: number;
  clinicians: number;
  critical: number;
  urgent: number;
  info: number;
  unhandled: number;
  within: number;
  overdue: number;
  ack_minutes: number;
  critical_ack_minutes: number;
  answers: number;
  needs_review: number;
  high: number;
  medium: number;
  low: number;
  reviews: number;
  agreed: number;
  review_hours: number;
};

/** Day `k` is k whole days before `to` (0 is the last full day). */
function day(p: Profile, k: number) {
  const L: Daily =
    k < WINDOW_DAYS ? { ...p.previous, ...p.current } : p.previous;
  const w = 1 + 0.12 * Math.sin(k * 1.3 + p.seed);
  const v = 1 + 0.05 * Math.sin(k * 0.7 + p.seed * 2);
  const questions = L.questions * w;
  const critical = L.critical * w;
  const answers = questions * 0.97;
  const reviews = answers * L.reviewed;
  return {
    questions,
    critical,
    urgent: L.urgent * w,
    info: L.info * w,
    unhandled: L.unhandled * w,
    within: critical * Math.min(1, L.critical_within * v),
    ack_minutes: L.ack_minutes * v,
    critical_ack_minutes: L.critical_ack_minutes * v,
    answers,
    needs_review: answers * L.needs_review,
    high: answers * L.high,
    medium: answers * L.medium,
    reviews,
    agreed: reviews * L.agreement,
    review_hours: L.review_hours * v,
  };
}

/** The sums over days `[k0, k1)`, rounded like the backend would. */
function sum(
  p: Profile,
  k0: number,
  k1: number,
  clinicians: number,
  overdue = 0,
): Raw {
  const s = {
    questions: 0,
    critical: 0,
    urgent: 0,
    info: 0,
    unhandled: 0,
    within: 0,
    answers: 0,
    needs_review: 0,
    high: 0,
    medium: 0,
    reviews: 0,
    agreed: 0,
    ack: 0,
    alerts: 0,
    critAck: 0,
    hours: 0,
  };
  for (let k = k0; k < k1; k++) {
    const d = day(p, k);
    const alerts = d.critical + d.urgent + d.info;
    s.questions += d.questions;
    s.critical += d.critical;
    s.urgent += d.urgent;
    s.info += d.info;
    s.unhandled += d.unhandled;
    s.within += d.within;
    s.answers += d.answers;
    s.needs_review += d.needs_review;
    s.high += d.high;
    s.medium += d.medium;
    s.reviews += d.reviews;
    s.agreed += d.agreed;
    s.ack += d.ack_minutes * alerts;
    s.alerts += alerts;
    s.critAck += d.critical_ack_minutes * d.critical;
    s.hours += d.review_hours * d.reviews;
  }
  const r = Math.round;
  const critical = r(s.critical);
  const answers = r(s.answers);
  const high = Math.min(answers, r(s.high));
  const medium = Math.min(answers - high, r(s.medium));
  const reviews = r(s.reviews);
  return {
    questions: r(s.questions),
    clinicians,
    critical,
    urgent: r(s.urgent),
    info: r(s.info),
    unhandled: r(s.unhandled),
    within: Math.min(critical, r(s.within)),
    overdue,
    ack_minutes: s.alerts ? s.ack / s.alerts : 0,
    critical_ack_minutes: s.critical ? s.critAck / s.critical : 0,
    answers,
    needs_review: Math.min(answers, r(s.needs_review)),
    high,
    medium,
    low: answers - high - medium,
    reviews,
    agreed: Math.min(reviews, r(s.agreed)),
    review_hours: s.reviews ? s.hours / s.reviews : 0,
  };
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
      1,
    ),
  };
}

function toAlertsRow(x: Raw): Body<AlertsRow> {
  const total = x.critical + x.urgent + x.info;
  const by_severity = set({
    critical: count(x.critical),
    urgent: count(x.urgent),
    info: count(x.info),
  });
  const crit = by_severity.critical;
  const totalG = count(total);
  return {
    by_severity,
    total: totalG,
    unhandled: count(x.unhandled),
    median_ack_minutes: over(x.ack_minutes, [totalG], total),
    critical_median_ack_minutes: over(
      x.critical_ack_minutes,
      [crit],
      x.critical,
    ),
    // Hidden when the alerts within or outside the target are 1–4.
    critical_within_target: over(
      x.within / (x.critical || 1),
      [crit, count(x.within), count(x.critical - x.within)],
      x.critical,
      SHARE_DP,
    ),
    critical_target_minutes: CRITICAL_TARGET_MINUTES,
    critical_overdue: count(x.overdue),
  };
}

function toQualityRow(x: Raw): Body<QualityRow> {
  const answers = count(x.answers);
  const reviews = count(x.reviews);
  return {
    answers,
    reviews,
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
    // Hidden when the reviews that agreed or disagreed are 1–4.
    agreement_rate: over(
      x.agreed / (x.reviews || 1),
      [reviews, count(x.agreed), count(x.reviews - x.agreed)],
      x.reviews,
      SHARE_DP,
    ),
    median_review_hours: over(x.review_hours, [reviews], x.reviews),
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
const medCount = (gs: Guarded[]): Guarded => {
  const m = median(gs);
  return m === null ? { value: null, suppressed: false } : count(Math.round(m));
};
const medRate = (gs: Guarded[], deps: Guarded[], dp = 0): Guarded => {
  const m = median(gs);
  if (deps.some((d) => d.suppressed)) return HIDDEN;
  if (m === null) return { value: null, suppressed: false };
  const f = 10 ** dp;
  return { value: Math.round(m * f) / f, suppressed: false };
};

function toUseMedian(rows: Body<UseRow>[]): Body<UseRow> {
  const questions = medCount(rows.map((r) => r.questions));
  const active_clinicians = medCount(rows.map((r) => r.active_clinicians));
  return {
    questions,
    active_clinicians,
    questions_per_clinician: medRate(
      rows.map((r) => r.questions_per_clinician),
      [questions, active_clinicians],
      1,
    ),
  };
}
function toAlertsMedian(rows: Body<AlertsRow>[]): Body<AlertsRow> {
  const by_severity = set({
    critical: medCount(rows.map((r) => r.by_severity.critical)),
    urgent: medCount(rows.map((r) => r.by_severity.urgent)),
    info: medCount(rows.map((r) => r.by_severity.info)),
  });
  const total = medCount(rows.map((r) => r.total));
  const crit = by_severity.critical;
  return {
    by_severity,
    total,
    unhandled: medCount(rows.map((r) => r.unhandled)),
    median_ack_minutes: medRate(
      rows.map((r) => r.median_ack_minutes),
      [total],
    ),
    critical_median_ack_minutes: medRate(
      rows.map((r) => r.critical_median_ack_minutes),
      [crit],
    ),
    critical_within_target: medRate(
      rows.map((r) => r.critical_within_target),
      [crit],
      2,
    ),
    critical_target_minutes: CRITICAL_TARGET_MINUTES,
    critical_overdue: medCount(rows.map((r) => r.critical_overdue)),
  };
}
function toQualityMedian(rows: Body<QualityRow>[]): Body<QualityRow> {
  const answers = medCount(rows.map((r) => r.answers));
  const reviews = medCount(rows.map((r) => r.reviews));
  return {
    answers,
    reviews,
    needs_review_share: medRate(
      rows.map((r) => r.needs_review_share),
      [answers],
      2,
    ),
    confidence: set({
      high: medCount(rows.map((r) => r.confidence.high)),
      medium: medCount(rows.map((r) => r.confidence.medium)),
      low: medCount(rows.map((r) => r.confidence.low)),
    }),
    agreement_rate: medRate(
      rows.map((r) => r.agreement_rate),
      [reviews],
      2,
    ),
    median_review_hours: medRate(
      rows.map((r) => r.median_review_hours),
      [reviews],
    ),
  };
}

// ---- The replies -------------------------------------------------------------

/** The last whole UTC day ends at `to`. */
const endOfDays = (now: number) => Math.floor(now / DAY) * DAY;
const CLIN: Record<Period, number> = { "7d": 1, "30d": 2, "90d": 3 };

/** Daily buckets for 7 and 30 days, weekly for 90 (the last one shorter). */
function buckets(period: Period, to: number) {
  const days = DAYS[period];
  const size = period === "90d" ? 7 : 1;
  const out: { start: number; k0: number; k1: number; days: number }[] = [];
  for (let d = 0; d < days; d += size) {
    const n = Math.min(size, days - d);
    // Days before `to`: this bucket covers k in [days - d - n, days - d).
    out.push({
      start: to - (days - d) * DAY,
      k0: days - d - n,
      k1: days - d,
      days: n,
    });
  }
  return out;
}

export function isAnalyticsHospital(id: string): boolean {
  return PROFILES.some((p) => p.hospital.id === id);
}

export function buildAnalytics(
  period: Period,
  now: number,
  mode: AnalyticsMode,
  changes: Change[],
): AnalyticsOut {
  const to = endOfDays(now);
  const days = DAYS[period];
  const head = { period, from: iso(to - days * DAY), to: iso(to) };
  if (mode === "unavailable") {
    const no = { unavailable: true } as const;
    return {
      ...head,
      changes: no,
      use: no,
      alerts: no,
      quality: no,
      hospitals: no,
    };
  }
  const raws = PROFILES.map((p) =>
    sum(p, 0, days, p.clinicians[CLIN[period]], p.overdue),
  );
  const rows = <R>(make: (x: Raw) => Body<R>) =>
    raws.map((x, i) => ({ hospital: PROFILES[i]!.hospital, ...make(x) }) as R);
  const use = rows<UseRow>(toUseRow);
  const alerts = rows<AlertsRow>(toAlertsRow);
  const quality = rows<QualityRow>(toQualityRow);
  const trend = (value: (xs: Raw[]) => Guarded) =>
    buckets(period, to).map((b) => ({
      start: iso(b.start),
      value: value(PROFILES.map((p) => sum(p, b.k0, b.k1, 0))),
    }));
  const total = (xs: Raw[], f: (x: Raw) => number) =>
    xs.reduce((a, x) => a + f(x), 0);
  const ago = (m: number) => iso(now - m * MIN);
  return {
    ...head,
    changes: {
      updated_at: ago(6),
      window: { from: iso(to - WINDOW_DAYS * DAY), to: iso(to) },
      items: structuredClone(changes),
    },
    use: {
      updated_at: ago(4),
      rows: use,
      median: toUseMedian(use),
      trend: trend((xs) => count(total(xs, (x) => x.questions))),
    },
    alerts: {
      updated_at: ago(2),
      rows: alerts,
      median: toAlertsMedian(alerts),
      trend: trend((xs) =>
        count(total(xs, (x) => x.critical + x.urgent + x.info)),
      ),
    },
    quality: {
      updated_at: ago(9),
      rows: quality,
      median: toQualityMedian(quality),
      trend: trend((xs) => {
        const a = total(xs, (x) => x.answers);
        const n = total(xs, (x) => x.needs_review);
        return over(n / (a || 1), [count(a), count(n)], a, 2);
      }),
    },
    hospitals: {
      updated_at: ago(4),
      rows: PROFILES.map((p, i) => ({
        hospital: p.hospital,
        size: {
          staff: p.staff,
          active_clinicians: use[i]!.active_clinicians,
          questions: use[i]!.questions,
        },
      })),
    },
  };
}

const COUNT_MEASURES: readonly MeasureId[] = [
  "questions",
  "active_clinicians",
  "unhandled_alerts",
  "alerts_total",
];

/** One measure from a sum, under the same rules as the rows. */
function pick(measure: MeasureId, x: Raw): Guarded {
  switch (measure) {
    case "questions_per_clinician":
      return toUseRow(x).questions_per_clinician;
    case "questions":
      return toUseRow(x).questions;
    case "active_clinicians":
      return toUseRow(x).active_clinicians;
    case "critical_median_ack_minutes":
      return toAlertsRow(x).critical_median_ack_minutes;
    case "critical_within_target":
      return toAlertsRow(x).critical_within_target;
    case "unhandled_alerts":
      return toAlertsRow(x).unhandled;
    case "alerts_total":
      return toAlertsRow(x).total;
    case "needs_review_share":
      return toQualityRow(x).needs_review_share;
    case "agreement_rate":
      return toQualityRow(x).agreement_rate;
    case "median_review_hours":
      return toQualityRow(x).median_review_hours;
  }
}

/**
 * A measure for one hospital (or all of them, with `hospitalId` null) over
 * the period, with the median of the other hospitals. A median of counts
 * that would be 1–4 is left out.
 */
export function buildSeries(
  hospitalId: string | null,
  measure: MeasureId,
  period: Period,
  now: number,
): SeriesOut {
  const to = endOfDays(now);
  const at = (p: Profile, b: ReturnType<typeof buckets>[number]) =>
    sum(p, b.k0, b.k1, p.clinicians[b.days === 1 ? 0 : 1]);
  const self = PROFILES.find((p) => p.hospital.id === hospitalId) ?? null;
  const others = PROFILES.filter((p) => p !== self);
  const points = buckets(period, to).map((b) => {
    let value: Guarded;
    let med: number | null = null;
    if (self) {
      value = pick(measure, at(self, b));
      med = median(others.map((p) => pick(measure, at(p, b))));
      if (med !== null) {
        med = Math.round(med * 100) / 100;
        if (COUNT_MEASURES.includes(measure) && small(Math.round(med)))
          med = null;
      }
    } else {
      // All hospitals together: one total, no median to compare with.
      const xs = PROFILES.map((p) => at(p, b));
      const all: Raw = { ...xs[0]! };
      for (const k of Object.keys(all) as (keyof Raw)[])
        all[k] = xs.reduce((a, x) => a + x[k], 0);
      value = COUNT_MEASURES.includes(measure)
        ? pick(measure, all)
        : { value: null, suppressed: false };
    }
    return { start: iso(b.start), value, median: med };
  });
  return { measure, hospital: self?.hospital ?? ALL_HOSPITALS, points };
}
