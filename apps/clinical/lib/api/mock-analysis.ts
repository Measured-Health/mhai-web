import type { NamedPosition } from "@mhai/ui/clearances";
import { SMALL_GROUP_MIN, isSmallCount } from "@mhai/ui/small-groups";
import { getAuthClient } from "../auth/client";
import { dismissReasonLabel } from "../notifications/alert-view";
import { getAdminClient } from "./admin";
import type { ConfidenceLevel, GuardedOut, StaffOut } from "./admin-contract";
import type { DismissReason } from "./alerts-contract";
import type { AnalysisClient } from "./analysis";
import type {
  AffectedOut,
  AgeBand,
  AnalysisFilters,
  ClearanceMeOut,
  CoOccurringOut,
  ConditionRef,
  Drillable,
  FilterOptionsOut,
  FindingsOut,
  HistoryPoint,
  Meta,
  NamedPatientRowOut,
  NamedPatientsIn,
  NamedPatientsOut,
  NamedPurpose,
  PatientRowOut,
  PeriodLevel,
  PeriodRef,
  DeidentifiedPatientsOut,
  PrevalenceOut,
  QualityOut,
  Setting,
  Sex,
  ViewId,
  ViewOut,
} from "./analysis-contract";
import {
  COHORT,
  CONDITIONS,
  FILTER_OPTIONS,
  LOCATIONS,
  SOURCES,
  SPECIALTIES,
  UPDATED_AT,
  type CohortPatient,
} from "./analysis-fixtures";
import { emptyFilters } from "../analysis/filters";
import { isPeriodRef, periodSpan } from "../analysis/periods";
import { ApiError } from "./errors";
import { recordAudit } from "./mock-audit";
import {
  coverFor,
  createMockClearances,
  endOfHospitalDay,
  lettersFor,
} from "./mock-clearances";

export const PATIENT_ROWS_MAX = 200;
/** The demo's stand-in for the server's earliest-end rule: names for an hour at most. */
export const NAMED_VIEW_MS = 3_600_000;
const PURPOSES: readonly NamedPurpose[] = [
  "clinical_follow_up",
  "quality_improvement",
  "audit",
  "other",
];
const NOTE_MAX = 200;
export type MockAnalysisMode = "normal" | "unavailable" | { failView: ViewId };

/**
 * The demo hospital's Analysis switch: on. An end-to-end test can turn it
 * off by setting `mhaiDemoAnalysisOff` on the window before the app loads
 * (the demo only; live, core decides).
 */
const demoAnalysisSwitch = (): "on" | "off" =>
  typeof window !== "undefined" &&
  (window as { mhaiDemoAnalysisOff?: unknown }).mhaiDemoAnalysisOff === true
    ? "off"
    : "on";

// --- the small-group rule, the way the server must apply it ---

const hide = (): GuardedOut => ({ value: null, suppressed: true });
/** A count of 1 to 4 is hidden; 0 is shown (it identifies no one). */
const guard = (n: number): GuardedOut =>
  isSmallCount(n) ? hide() : { value: n, suppressed: false };

/**
 * A set that adds up to `total`. Each member is hidden if 1 to 4; then, while
 * a hidden member could be worked out (only one is hidden, or the hidden ones
 * add up to 1 to 4 alone), the next-smallest shown member is hidden too. With
 * a hidden total (itself 1 to 4) every member is already hidden or zero.
 */
export function guardSet(values: number[], total: number): GuardedOut[] {
  const hidden = values.map(isSmallCount);
  if (total >= SMALL_GROUP_MIN) {
    const count = () => hidden.filter(Boolean).length;
    const sum = () => values.reduce((s, v, i) => (hidden[i] ? s + v : s), 0);
    while (count() > 0 && (count() < 2 || sum() < SMALL_GROUP_MIN)) {
      let next = -1;
      values.forEach((v, i) => {
        if (!hidden[i] && v > 0 && (next < 0 || v < values[next])) next = i;
      });
      if (next < 0) break;
      hidden[next] = true;
    }
  }
  return values.map((v, i) =>
    hidden[i] ? hide() : { value: v, suppressed: false },
  );
}

/**
 * A count and, while the views are worked out, its row's token (`age-…`,
 * `pair-…`, `finding-…`), or null where core never lists (prevalence,
 * location, specialty). `withDrillKeys` turns the token into a drill key
 * bound to the context, or drops it, before anything leaves the mock.
 */
const drillable = (g: GuardedOut, drill: string | null): Drillable => ({
  ...g,
  drill:
    drill !== null && !g.suppressed && (g.value ?? 0) >= SMALL_GROUP_MIN
      ? drill
      : null,
});

/** A share of `den` that must not give away its numerator or its complement. */
export function share(num: number, den: GuardedOut, denN: number): GuardedOut {
  if (den.suppressed || denN === 0)
    return { value: null, suppressed: den.suppressed };
  if (isSmallCount(num) || isSmallCount(denN - num)) return hide();
  return { value: Math.round((num / denN) * 100) / 100, suppressed: false };
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}
/** A median over fewer than 5 values, or over a count that is hidden, is hidden. */
function guardMedian(xs: number[], base: GuardedOut): GuardedOut {
  if (base.suppressed) return hide();
  if (xs.length === 0) return { value: null, suppressed: false };
  if (xs.length < SMALL_GROUP_MIN) return hide();
  return { value: median(xs), suppressed: false };
}

// --- the cohort, filtered ---

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
const AGE_ORDER: AgeBand[] = ["0-17", "18-39", "40-64", "65-79", "80+"];
const SEX_ORDER: Sex[] = ["female", "male", "other", "not_recorded"];
const SETTING_ORDER: Setting[] = ["admitted", "outpatient", "emergency"];
const ageToken = (b: AgeBand) => b.replace("-", "to").replace("+", "plus");
const condRef = (id: string) => CONDITIONS.find((c) => c.id === id)!;
const condIndex = (id: string) => CONDITIONS.findIndex((c) => c.id === id);
const findingKey = (name: string | null, flag: string | null) =>
  `${name ? slug(name) : "unmapped"}_${flag ?? "none"}`;

/** The filters with their period's first and last days, as the demo counts them. */
type Win = AnalysisFilters & { from: string; to: string };
const win = (f: AnalysisFilters): Win => ({ ...f, ...periodSpan(f.period) });

/** The demo's frozen periods (the fixtures'). */
export const MOCK_PERIODS: Record<PeriodLevel, string[]> =
  FILTER_OPTIONS.periods;
const LATEST_MONTH: PeriodRef = {
  level: "month",
  start: MOCK_PERIODS.month[MOCK_PERIODS.month.length - 1],
};
/**
 * The demo's one period still being worked out the first time it's asked
 * for (core's 503 `not_ready`): the oldest quarter.
 */
export const COLD_PERIOD: PeriodRef = {
  level: "quarter",
  start: MOCK_PERIODS.quarter[0],
};
/** New filter sets a person may open per period (core's cold-context cap). */
export const COLD_CONTEXTS_MAX = 100;

const demo = (p: CohortPatient, f: Win) =>
  (f.age_band === null || p.age_band === f.age_band) &&
  (f.sex === null || p.sex === f.sex) &&
  (f.location === null || p.location === f.location) &&
  (f.setting === null || p.setting === f.setting) &&
  (f.specialty === null || p.specialty === f.specialty) &&
  (f.source === null || p.source === f.source);
const inRange = (d: string, f: Win) => d >= f.from && d <= f.to;
/** The conditions in scope for a patient: known by the end of the window, and the chosen one. */
const scoped = (p: CohortPatient, f: Win) =>
  p.conditions.filter(
    (c) => c.onset <= f.to && (f.condition === null || c.id === f.condition),
  );

/** Patients with a visit in the window, who match every filter. */
function population(f: Win): CohortPatient[] {
  return COHORT.filter(
    (p) =>
      demo(p, f) &&
      p.visits.some((d) => inRange(d, f)) &&
      (f.condition === null || scoped(p, f).length > 0),
  );
}

function meta(f: Win, pop: CohortPatient[]): Meta {
  return {
    updated_at: UPDATED_AT,
    from: f.from,
    to: f.to,
    // A quarter by month; a month by its weeks; a week is its own point.
    bucket: f.period.level === "quarter" ? "month" : "week",
    patients: guard(pop.length),
    period: { ...f.period },
    history: [],
  };
}

function buckets(f: Win, kind: "week" | "month") {
  const out: { start: string; end: string }[] = [];
  let cur = Date.parse(f.from);
  const last = Date.parse(f.to);
  while (cur <= last) {
    let end: number;
    if (kind === "week") {
      // Month-aligned: 1–7, 8–14, 15–21, then 22 to the month's end.
      const d = new Date(cur);
      end =
        d.getUTCDate() === 22
          ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
          : cur + 6 * 86_400_000;
    } else {
      const d = new Date(cur);
      end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
    }
    end = Math.min(end, last);
    out.push({
      start: new Date(cur).toISOString().slice(0, 10),
      end: new Date(end).toISOString().slice(0, 10),
    });
    cur = end + 86_400_000;
  }
  return out;
}

const isListed = (p: PeriodRef) =>
  isPeriodRef(p) && MOCK_PERIODS[p.level].includes(p.start);

/** The period's lists: conditions with 5 or more patients there, and every "Not standardised" one. */
function listsFor(period: PeriodRef): Omit<FilterOptionsOut, "periods"> {
  const pop = population(win(emptyFilters(period)));
  const n = new Map<string, number>();
  for (const p of pop)
    for (const c of scoped(p, win(emptyFilters(period))))
      n.set(c.id, (n.get(c.id) ?? 0) + 1);
  return {
    updated_at: UPDATED_AT,
    conditions: CONDITIONS.filter(
      (c) => c.name === null || (n.get(c.id) ?? 0) >= SMALL_GROUP_MIN,
    ),
    locations: LOCATIONS,
    specialties: SPECIALTIES,
    sources: SOURCES,
  };
}

/** As core refuses a request: not one listed period, too many filters, or an id the period doesn't list. */
function checkRequest(f: AnalysisFilters) {
  if (!f.period || !isListed(f.period))
    throw new ApiError(422, "invalid_range");
  const set = (
    [
      "condition",
      "age_band",
      "sex",
      "location",
      "setting",
      "specialty",
      "source",
    ] as const
  ).filter((k) => f[k] !== null);
  if (set.length > 2) throw new ApiError(422, "too_many_filters");
  if (f.location !== null && f.setting !== null)
    throw new ApiError(422, "validation_failed");
  if (
    f.condition !== null &&
    !listsFor(f.period).conditions.some((c) => c.id === f.condition)
  )
    throw new ApiError(422, "validation_failed");
}

/**
 * Up to 7 earlier listed periods of the same level, oldest first, each
 * from its own numbers; a condition that period doesn't list is a point
 * hidden whole. Never a total across them.
 */
function history(f: AnalysisFilters): HistoryPoint[] {
  const list = MOCK_PERIODS[f.period.level];
  const i = list.indexOf(f.period.start);
  return list.slice(Math.max(0, i - 7), Math.max(0, i)).map((start) => {
    const at: AnalysisFilters = {
      ...f,
      period: { level: f.period.level, start },
    };
    if (
      f.condition !== null &&
      !listsFor(at.period).conditions.some((c) => c.id === f.condition)
    )
      return { start, cases: hide(), new: hide(), patients: hide() };
    const d = prevalence(win(at));
    return {
      start,
      cases: d.total.cases,
      new: d.total.new,
      patients: d.patients,
    };
  });
}

// --- the five views ---

function prevalence(f: Win): PrevalenceOut {
  const pop = population(f);
  const m = meta(f, pop);
  const per = new Map<string, { cases: number; fresh: number }>();
  let cases = 0;
  let fresh = 0;
  for (const p of pop) {
    const sc = scoped(p, f);
    if (sc.length === 0) continue;
    cases++;
    if (sc.every((c) => c.onset >= f.from)) fresh++;
    for (const c of sc) {
      const row = per.get(c.id) ?? { cases: 0, fresh: 0 };
      row.cases++;
      if (c.onset >= f.from) row.fresh++;
      per.set(c.id, row);
    }
  }
  const [tn, te] = guardSet([fresh, cases - fresh], cases);
  const by_condition = [...per.entries()]
    .sort(
      (a, b) => b[1].cases - a[1].cases || condIndex(a[0]) - condIndex(b[0]),
    )
    .map(([id, r]) => {
      const [n, e] = guardSet([r.fresh, r.cases - r.fresh], r.cases);
      return {
        condition: condRef(id),
        // Prevalence counts cases, not patients: never a list.
        cases: drillable(guard(r.cases), null),
        new: n,
        existing: e,
      };
    });
  const series = buckets(f, m.bucket).map(({ start, end }) => {
    let c = 0;
    let n = 0;
    for (const p of pop) {
      const sc = scoped(p, f).filter((x) => x.onset <= end);
      if (sc.length === 0 || !p.visits.some((d) => d >= start && d <= end))
        continue;
      c++;
      const first = sc.reduce(
        (a, x) => (x.onset < a ? x.onset : a),
        sc[0].onset,
      );
      if (first >= start) n++;
    }
    // New and the rest (existing that week, not sent) add up to cases:
    // guarded as one set, so a shown point can't give away 1 to 4.
    const [fresh] = guardSet([n, c - n], c);
    return { start, cases: guard(c), new: fresh };
  });
  return {
    ...m,
    total: { cases: guard(cases), new: tn, existing: te },
    by_condition,
    series,
  };
}

function groups<K extends string | null>(
  pop: CohortPatient[],
  key: (p: CohortPatient) => K,
  order: readonly K[] | null,
): { key: K; n: number }[] {
  const counts = new Map<K, number>();
  for (const k of order ?? []) counts.set(k, 0);
  for (const p of pop) counts.set(key(p), (counts.get(key(p)) ?? 0) + 1);
  const rows = [...counts.entries()].map(([k, n]) => ({ key: k, n }));
  return order ? rows : rows.filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
}

function affected(f: Win): AffectedOut {
  const pop = population(f);
  const m = meta(f, pop);
  /** A partition of the patients: guarded as one set against the total. */
  function part<K extends string | null>(
    key: (p: CohortPatient) => K,
    order: readonly K[] | null,
    token: (k: K) => string | null,
  ) {
    const rows = groups(pop, key, order);
    const g = guardSet(
      rows.map((r) => r.n),
      pop.length,
    );
    return rows.map((r, i) => ({
      k: r.key,
      patients: drillable(g[i], token(r.key)),
    }));
  }
  return {
    ...m,
    by_age: part(
      (p) => p.age_band,
      AGE_ORDER,
      (b) => `age-${ageToken(b)}`,
    ).map((r) => ({
      band: r.k,
      patients: r.patients,
    })),
    by_sex: part(
      (p) => p.sex,
      SEX_ORDER,
      (s) => `sex-${s}`,
    ).map((r) => ({
      sex: r.k,
      patients: r.patients,
    })),
    by_setting: part<Setting | null>(
      (p) => p.setting,
      [...SETTING_ORDER, null].filter(
        (s) => s !== null || pop.some((p) => p.setting === null),
      ),
      (s) => `setting-${s ?? "none"}`,
    ).map((r) => ({ setting: r.k, patients: r.patients })),
    // Never a list on location or specialty (core 1.19.0).
    by_location: part<string | null>(
      (p) => p.location,
      null,
      () => null,
    ).map((r) => ({
      location: r.k === null ? null : LOCATIONS.find((l) => l.id === r.k)!,
      patients: r.patients,
    })),
    by_specialty: part<string | null>(
      (p) => p.specialty,
      null,
      () => null,
    ).map((r) => ({ specialty: r.k, patients: r.patients })),
  };
}

function pairsOf(pop: CohortPatient[], f: Win) {
  const have = pop.map((p) => new Set(scoped(p, f).map((c) => c.id)));
  // "Not standardised" is counted in prevalence, but a pair with an unknown condition says nothing.
  const ids = CONDITIONS.filter((c) => c.id !== "unmapped").map((c) => c.id);
  const out: { a: string; b: string; a_n: number; both: number }[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a_n = have.filter((s) => s.has(ids[i])).length;
      const both = have.filter((s) => s.has(ids[i]) && s.has(ids[j])).length;
      if (both > 0) out.push({ a: ids[i], b: ids[j], a_n, both });
    }
  return out
    .sort((x, y) => y.both - x.both || condIndex(x.a) - condIndex(y.a))
    .slice(0, 20);
}

function coOccurring(f: Win): CoOccurringOut {
  const pop = population(f);
  return {
    ...meta(f, pop),
    pairs: pairsOf(pop, f).map((p) => {
      const a_patients = guard(p.a_n);
      // "With both" and "with a only" add up to a: guard them as one set, so a
      // shown pair can't give away a complement of 1 to 4.
      const [patients] = guardSet([p.both, p.a_n - p.both], p.a_n);
      return {
        a: condRef(p.a),
        b: condRef(p.b),
        a_patients,
        patients: drillable(patients, `pair-${p.a}-${p.b}`),
        share_of_a: patients.suppressed
          ? hide()
          : share(p.both, a_patients, p.a_n),
      };
    }),
  };
}

const SEVERITIES = ["critical", "urgent", "info"] as const;
const REASONS: DismissReason[] = [
  "not_relevant",
  "already_known",
  "wrong_patient",
  "other",
];

function findings(f: Win): FindingsOut {
  const pop = population(f);
  const per = new Map<
    string,
    {
      name: string | null;
      flag: CohortPatient["findings"][number]["flag"];
      pids: Set<string>;
      results: number;
    }
  >();
  const alerts = pop.flatMap((p) => p.alerts.filter((a) => inRange(a.date, f)));
  for (const p of pop)
    for (const x of p.findings) {
      if (!inRange(x.date, f)) continue;
      const k = findingKey(x.name, x.flag);
      const row = per.get(k) ?? {
        name: x.name,
        flag: x.flag,
        pids: new Set<string>(),
        results: 0,
      };
      row.pids.add(p.pid);
      row.results++;
      per.set(k, row);
    }
  const rows = [...per.entries()]
    .sort((a, b) => b[1].pids.size - a[1].pids.size || a[0].localeCompare(b[0]))
    .slice(0, 20)
    .map(([k, r]) => ({
      name: r.name,
      flag: r.flag,
      patients: drillable(guard(r.pids.size), `finding-${k}`),
      results: guard(r.results),
    }));
  const total = guard(alerts.length);
  const sev = guardSet(
    SEVERITIES.map((s) => alerts.filter((a) => a.severity === s).length),
    alerts.length,
  );
  const acked = (s?: string) =>
    alerts
      .filter(
        (a) => a.ack_minutes !== null && (s === undefined || a.severity === s),
      )
      .map((a) => a.ack_minutes as number);
  const dismissed = alerts.filter((a) => a.dismissed !== null);
  // Dismissed and the rest add up to all alerts: guarded as one set.
  const [dismissedG] = guardSet(
    [dismissed.length, alerts.length - dismissed.length],
    alerts.length,
  );
  const reasonCounts = REASONS.map(
    (r) => dismissed.filter((a) => a.dismissed === r).length,
  );
  // Under a hidden dismissed count, every reason above 0 is hidden too.
  const reasons = dismissedG.suppressed
    ? reasonCounts.map((n) => (n > 0 ? hide() : guard(0)))
    : guardSet(reasonCounts, dismissed.length);
  return {
    ...meta(f, pop),
    findings: rows,
    alerts: {
      total,
      by_severity: { critical: sev[0], urgent: sev[1], info: sev[2] },
      median_ack_minutes: guardMedian(acked(), total),
      critical_median_ack_minutes: guardMedian(acked("critical"), sev[0]),
      dismissed: dismissedG,
      dismiss_reasons: REASONS.map((reason, i) => ({
        reason,
        count: reasons[i],
      })),
    },
  };
}

const LEVELS: ConfidenceLevel[] = ["high", "caution", "review", "failed"];

function quality(f: Win): QualityOut {
  const pop = population(f);
  const per = new Map<string, CohortPatient["consultations"]>();
  for (const p of pop)
    for (const c of p.consultations) {
      if (
        !inRange(c.date, f) ||
        (f.condition !== null && c.condition !== f.condition)
      )
        continue;
      per.set(c.condition, [...(per.get(c.condition) ?? []), c]);
    }
  const by_condition = [...per.entries()]
    .sort(
      (a, b) => b[1].length - a[1].length || condIndex(a[0]) - condIndex(b[0]),
    )
    .map(([id, cs]) => {
      const conf = guardSet(
        LEVELS.map((l) => cs.filter((c) => c.confidence === l).length),
        cs.length,
      );
      const rated = cs.filter((c) => c.agreed !== null);
      const agreed = rated.filter((c) => c.agreed).length;
      // Rated and the rest add up to the consultations: one set.
      const [ratedG] = guardSet(
        [rated.length, cs.length - rated.length],
        cs.length,
      );
      const corr = cs.flatMap((c) => c.corrections);
      const outcomes = guardSet(
        (["approved", "rejected", "waiting"] as const).map(
          (o) => corr.filter((x) => x === o).length,
        ),
        corr.length,
      );
      return {
        condition: condRef(id) as ConditionRef,
        consultations: guard(cs.length),
        confidence: Object.fromEntries(
          LEVELS.map((l, i) => [l, conf[i]]),
        ) as Record<ConfidenceLevel, GuardedOut>,
        agreement_rate: share(agreed, ratedG, rated.length),
        rated: ratedG,
        corrections: {
          total: guard(corr.length),
          approved: outcomes[0],
          rejected: outcomes[1],
          waiting: outcomes[2],
        },
      };
    });
  return { ...meta(f, pop), by_condition };
}

// --- the order of rows, as the server must send them ---

type RowName = { name: string; tie?: string; last: boolean };
/**
 * Shown rows keep their order (largest first); hidden rows go after them by
 * a fixed name, "Not standardised" and "… not recorded" last, never by
 * their true size.
 */
function hiddenLast<R>(
  rows: R[],
  g: (r: R) => GuardedOut,
  key: (r: R) => RowName,
): R[] {
  const by = (a: R, b: R) =>
    Number(key(a).last) - Number(key(b).last) ||
    key(a).name.localeCompare(key(b).name, "en-GB") ||
    (key(a).tie ?? "").localeCompare(key(b).tie ?? "", "en-GB");
  return [
    ...rows.filter((r) => !g(r).suppressed),
    ...rows.filter((r) => g(r).suppressed).sort(by),
  ];
}
const condName = (c: ConditionRef): RowName => ({
  name: c.name ?? "",
  tie: `${c.icd10 ?? ""} ${c.id}`,
  last: c.name === null,
});

const VIEW_FNS: { [V in ViewId]: (f: Win) => ViewOut[V] } = {
  prevalence: (f) => {
    const d = prevalence(f);
    return {
      ...d,
      by_condition: hiddenLast(
        d.by_condition,
        (r) => r.cases,
        (r) => condName(r.condition),
      ),
    };
  },
  affected: (f) => {
    const d = affected(f);
    return {
      ...d,
      by_location: hiddenLast(
        d.by_location,
        (r) => r.patients,
        (r) => ({
          name: r.location?.label ?? "",
          tie: r.location?.id ?? "",
          last: r.location === null,
        }),
      ),
      by_specialty: hiddenLast(
        d.by_specialty,
        (r) => r.patients,
        (r) => ({ name: r.specialty ?? "", last: r.specialty === null }),
      ),
    };
  },
  "co-occurring": (f) => {
    const d = coOccurring(f);
    return {
      ...d,
      pairs: hiddenLast(
        d.pairs,
        (r) => r.patients,
        (r) => ({
          name: `${r.a.name ?? ""} + ${r.b.name ?? ""}`,
          tie: `${r.a.id} ${r.b.id}`,
          last: r.a.name === null || r.b.name === null,
        }),
      ),
    };
  },
  findings: (f) => {
    const d = findings(f);
    return {
      ...d,
      alerts: {
        ...d.alerts,
        dismiss_reasons: hiddenLast(
          d.alerts.dismiss_reasons,
          (r) => r.count,
          (r) => ({
            name: dismissReasonLabel(r.reason) ?? r.reason,
            last: false,
          }),
        ),
      },
      findings: hiddenLast(
        d.findings,
        (r) => r.patients,
        (r) => ({
          name: r.name ?? "",
          tie: r.flag ?? "",
          last: r.name === null,
        }),
      ),
    };
  },
  quality: (f) => {
    const d = quality(f);
    return {
      ...d,
      by_condition: hiddenLast(
        d.by_condition,
        (r) => r.consultations,
        (r) => condName(r.condition),
      ),
    };
  },
};

// --- patients behind a shown count ---

// --- drill keys, as core derives them (1.19.0) ---

/** The demo's one hospital: a key is bound to it like core's. */
const DEMO_HOSPITAL = "demo-hospital";
const B64URL =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** `n` bytes from `text` (FNV-1a lanes, mixed): stable, synthetic, not secret. */
function bytesOf(text: string, n: number): number[] {
  const out: number[] = [];
  for (let lane = 0; out.length < n; lane++) {
    let h = (0x811c9dc5 ^ Math.imul(lane + 1, 0x9e3779b1)) >>> 0;
    for (let i = 0; i < text.length; i++)
      h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    out.push(h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255);
  }
  return out.slice(0, n);
}

/** 32 bytes as 43 characters of base64url, no padding: a key's shape. */
function base64url(bytes: number[]): string {
  let bits = 0;
  let acc = 0;
  let out = "";
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += B64URL[(acc >>> bits) & 63];
    }
    acc &= (1 << bits) - 1;
  }
  if (bits > 0) out += B64URL[(acc << (6 - bits)) & 63];
  return out;
}

/** A pseudonym anywhere in a key: core drops such a key (the cell has no drill). */
const PID_IN = /(^|[^A-Za-z0-9])P-[A-Z0-9]{4,12}([^A-Za-z0-9]|$)/;

/** The context a key is bound to: the hospital, the period and every filter. */
const contextOf = (f: AnalysisFilters) =>
  JSON.stringify([
    DEMO_HOSPITAL,
    f.period.level,
    f.period.start,
    f.condition,
    f.age_band,
    f.sex,
    f.location,
    f.setting,
    f.specialty,
    f.source,
  ]);

/** Lists only under the filters a row shows: never location, specialty or source. */
const drillContextOk = (f: AnalysisFilters) =>
  f.location === null && f.specialty === null && f.source === null;

/** The key of one row (`token`) of `view`, in this context; null when core would drop it. */
function drillKey(
  f: AnalysisFilters,
  view: ViewId,
  token: string,
): string | null {
  const key = base64url(
    bytesOf(`analysis/drill/v1|${contextOf(f)}|${view}|${token}`, 32),
  );
  return PID_IN.test(key) ? null : key;
}

/** A row's key as the mock derives it: for tests, which open lists directly. */
export const mockDrillKey = (
  f: AnalysisFilters,
  view: ViewId,
  token: string,
): string | null => drillKey(f, view, token);

/** Each drillable count's token turned into its key; null outside a list's context. */
function withDrillKeys<V extends ViewId>(
  view: V,
  out: ViewOut[V],
  f: AnalysisFilters,
): ViewOut[V] {
  const ok = drillContextOk(f);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v !== "object" || v === null) return v;
    const o = v as Record<string, unknown>;
    if ("drill" in o && "suppressed" in o)
      return {
        ...o,
        drill:
          ok && typeof o.drill === "string" ? drillKey(f, view, o.drill) : null,
      };
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
  };
  return walk(out) as ViewOut[V];
}

/**
 * Every list the views would offer for these filters, by key: its row's
 * token and the shown count. Only these may be opened; a key of any other
 * period, filter set or row isn't here (core's 422 `too_small`).
 */
function shownDrills(f: Win): Map<string, { token: string; cell: number }> {
  const out = new Map<string, { token: string; cell: number }>();
  if (!drillContextOk(f)) return out;
  const a = affected(f);
  const add = (view: ViewId, d: Drillable) => {
    if (d.drill === null || d.value === null) return;
    const key = drillKey(f, view, d.drill);
    if (key) out.set(key, { token: d.drill, cell: d.value });
  };
  for (const r of a.by_age) add("affected", r.patients);
  for (const r of a.by_sex) add("affected", r.patients);
  for (const r of a.by_setting) add("affected", r.patients);
  for (const r of coOccurring(f).pairs) add("co-occurring", r.patients);
  for (const r of findings(f).findings) add("findings", r.patients);
  return out;
}

/**
 * A patient's pid in one list: random per hospital, period, level and
 * patient (core's H6d), so lists of two periods can't be joined up.
 */
function pidFor(
  p: CohortPatient,
  f: AnalysisFilters,
  level: "deidentified" | "named",
): string {
  const b = bytesOf(
    `pid|${DEMO_HOSPITAL}|${f.period.level}:${f.period.start}|${level}|${p.pid}`,
    8,
  );
  return `P-${b.map((x) => PID_CHARS[x % PID_CHARS.length]).join("")}`;
}
const PID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Core's list limits per person: 10 a minute, 50 a day, 300 patients a quarter. */
export const LISTS_PER_MINUTE = 10;
export const LISTS_PER_DAY = 50;
export const PATIENTS_PER_QUARTER = 300;

function matcher(drill: string, f: Win): (p: CohortPatient) => boolean {
  const i = drill.indexOf("-");
  const kind = drill.slice(0, i);
  const val = drill.slice(i + 1);
  switch (kind) {
    case "age":
      return (p) => ageToken(p.age_band) === val;
    case "sex":
      return (p) => p.sex === val;
    case "setting":
      return (p) => (p.setting ?? "none") === val;
    case "pair": {
      const [a, b] = val.split("-");
      return (p) => {
        const ids = scoped(p, f).map((c) => c.id);
        return ids.includes(a) && ids.includes(b);
      };
    }
    case "finding":
      return (p) =>
        p.findings.some(
          (x) => inRange(x.date, f) && findingKey(x.name, x.flag) === val,
        );
    default:
      return () => false;
  }
}

function rowOf(
  p: CohortPatient,
  f: Win,
  level: "deidentified" | "named" = "deidentified",
): PatientRowOut {
  return {
    pid: pidFor(p, f, level),
    age_band: p.age_band,
    sex: p.sex,
    setting: p.setting,
    conditions: p.conditions
      .filter((c) => c.onset <= f.to)
      .map((c) => condRef(c.id)),
    findings: p.findings
      .filter((x) => inRange(x.date, f))
      .slice(0, 10)
      .map((x) => ({
        name: x.name,
        flag: x.flag,
        // A de-identified row shows no source (core 1.19.0).
        source_label: level === "named" ? x.source_label : null,
      })),
  };
}

const namedRowOf = (p: CohortPatient, f: Win): NamedPatientRowOut => ({
  ...rowOf(p, f, "named"),
  name: p.name,
  mrn: p.mrn,
});

/** May this person hold a letter's cover: active, a hospital admin or analyst, with two-step. */
const eligible = (s: StaffOut | undefined): s is StaffOut =>
  !!s &&
  s.status === "active" &&
  (s.roles.includes("hospital_admin") || s.roles.includes("analyst")) &&
  !s.issues.includes("mfa_not_set_up");

/**
 * Why a person who held cover no longer does: the latest of their letters'
 * revocation, their removal from a letter, or a letter's end date passing.
 */
function lostCover(staffId: string, now: number): ClearanceMeOut["reason"] {
  const stops: { at: number; reason: ClearanceMeOut["reason"] }[] = [];
  for (const c of lettersFor(staffId, now)) {
    // A letter never verified never gave access, so it can't take it away.
    if (c.verified_at === null) continue;
    for (const h of c.history)
      if (h.kind === "narrowed" && h.removed?.some((p) => p.id === staffId))
        stops.push({ at: Date.parse(h.at), reason: "removed_from_letter" });
    if (!c.covered.some((p) => p.id === staffId)) continue;
    if (c.status === "revoked" && c.revocation)
      stops.push({ at: Date.parse(c.revocation.at), reason: "revoked" });
    else if (c.status === "active" || c.status === "ended")
      stops.push({
        at: Date.parse(endOfHospitalDay(c.end_date)),
        reason: "ended",
      });
  }
  const past = stops.filter((x) => x.at <= now);
  if (past.length === 0) return "none";
  return past.reduce((a, x) => (x.at >= a.at ? x : a)).reason;
}

/** The person and the request, in a stable form: what an Idempotency-Key is bound to. */
function fingerprint(personId: string | null, q: NamedPatientsIn): string {
  const f = q.filters as Record<string, unknown>;
  const filters = Object.keys(f)
    .sort()
    .map((k) => [k, f[k] ?? null]);
  return JSON.stringify([
    personId,
    q.drill,
    filters,
    q.purpose ?? null,
    q.note ?? null,
  ]);
}

const NOT_NAMED = (reason: ClearanceMeOut["reason"]): ClearanceMeOut => ({
  named: false,
  until: null,
  clearance_id: null,
  version: 0,
  reason,
});

/**
 * The demo's Analysis API: one hospital, a fixed synthetic cohort, computed
 * fresh for every filter combination. It applies the same small-group rules
 * the backend must (counts of 1 to 4 hidden, sets hidden together, shares and
 * medians over hidden counts hidden), and never stores anything.
 */
export function createMockAnalysis({
  delayMs = 150,
  analysis = "normal",
  analysisSwitch,
  now = () => Date.now(),
  actor = "Analyst",
  me: meOpt,
  staff: staffOpt,
  namedAccess = "on",
}: {
  delayMs?: number;
  analysis?: MockAnalysisMode;
  now?: () => number;
  /** Who the audit trail says opened the de-identified patients. */
  actor?: string;
  /** The signed-in person's email; by default the demo session's. */
  me?: () => Promise<string | null>;
  /** The hospital's staff, as the admin client lists them (roles change there). */
  staff?: () => Promise<StaffOut[]>;
  /** The effective named-access switch for this hospital. */
  namedAccess?: NamedPosition;
  /**
   * The hospital's Analysis switch (core answers 404 while it is off). By
   * default on, unless a test turned the demo's off before the page loaded.
   */
  analysisSwitch?: () => "on" | "off";
} = {}): AnalysisClient {
  const me =
    meOpt ??
    (async () => (await getAuthClient().getSession())?.user.email ?? null);
  const staff = staffOpt ?? (() => getAdminClient().listStaff());
  const wait = () =>
    delayMs > 0
      ? new Promise<void>((r) => setTimeout(r, delayMs))
      : Promise.resolve();
  const unavailable = () => {
    throw new ApiError(503, "unavailable");
  };
  const fail = (status: number, code: string): never => {
    throw new ApiError(status, code);
  };
  const position = analysisSwitch ?? demoAnalysisSwitch;
  /** Core's gate: off is 404, before anything else is read. */
  const gate = () => {
    if (position() === "off") fail(404, "not_found");
  };
  /** Periods whose numbers have been worked out (the cold one isn't, at first). */
  const warm = new Set<string>();
  /** The filter sets each period has had worked out, for the cold-context cap. */
  const contexts = new Map<string, Set<string>>();
  const periodKey = (p: PeriodRef) => `${p.level}:${p.start}`;
  function coldChecks(f: AnalysisFilters) {
    const key = periodKey(f.period);
    if (key === periodKey(COLD_PERIOD) && !warm.has(key)) {
      warm.add(key);
      fail(503, "not_ready");
    }
    const seen = contexts.get(key) ?? new Set<string>();
    const set = JSON.stringify({ ...f, period: null });
    if (!seen.has(set) && seen.size >= COLD_CONTEXTS_MAX)
      fail(429, "rate_limited");
    seen.add(set);
    contexts.set(key, seen);
  }

  /** Who is asking, from the staff list as it is now (never cached). */
  const person = async () => {
    const email = (await me())?.toLowerCase() ?? null;
    if (email === null) return undefined;
    return (await staff()).find((s) => s.email.toLowerCase() === email);
  };

  /**
   * The Idempotency-Key of each recorded view: who asked for what, and its
   * original named_until. Kept after expiry so a spent key stays spent (the
   * demo's memory only; never rows).
   */
  const viewed = new Map<string, { print: string; namedUntil: number }>();

  /** Each person's lists (times), and the patients each was sent per quarter. */
  const lists = new Map<string, number[]>();
  const reserved = new Map<string, Set<string>>();
  /**
   * Core's list limits, per person: 10 lists a minute, 50 a day and 300
   * different patients in the calendar quarter of the list's period (429
   * `rate_limited`). A refused list counts for nothing; an admitted one is
   * recorded with the patients it sent.
   */
  function admitList(who: string, period: PeriodRef, subjects: string[]) {
    const t = now();
    const day = new Date(t).toISOString().slice(0, 10);
    const times = lists.get(who) ?? [];
    if (times.filter((x) => t - x < 60_000).length >= LISTS_PER_MINUTE)
      fail(429, "rate_limited");
    const today = times.filter(
      (x) => new Date(x).toISOString().slice(0, 10) === day,
    );
    if (today.length >= LISTS_PER_DAY) fail(429, "rate_limited");
    const [y, m] = period.start.split("-").map(Number);
    const quarter = `${who}|${y}-Q${Math.floor((m - 1) / 3)}`;
    const seen = reserved.get(quarter) ?? new Set<string>();
    const fresh = subjects.filter((x) => !seen.has(x));
    if (seen.size + fresh.length > PATIENTS_PER_QUARTER)
      fail(429, "rate_limited");
    for (const x of fresh) seen.add(x);
    reserved.set(quarter, seen);
    lists.set(who, [...today, t]);
  }

  /** Whether names may show for this person right now, read live. */
  async function clearanceMe(): Promise<ClearanceMeOut> {
    if (namedAccess !== "on") return NOT_NAMED("switched_off");
    const p = await person();
    if (!eligible(p)) return NOT_NAMED("role_or_account");
    const t = now();
    const cover = coverFor(p.id, t);
    if (cover.covered && Date.parse(cover.until) > t)
      return {
        named: true,
        until: cover.until,
        clearance_id: cover.clearance_id,
        version: cover.version,
        reason: null,
      };
    return NOT_NAMED(lostCover(p.id, t));
  }

  return {
    async getFilterOptions(period?: PeriodRef) {
      await wait();
      gate();
      if (analysis === "unavailable") unavailable();
      if (period && !isListed(period)) fail(422, "invalid_range");
      return structuredClone({
        ...listsFor(period ?? LATEST_MONTH),
        periods: MOCK_PERIODS,
      });
    },
    async getView<V extends ViewId>(
      view: V,
      f: AnalysisFilters,
    ): Promise<ViewOut[V]> {
      await wait();
      gate();
      if (analysis === "unavailable") unavailable();
      if (typeof analysis === "object" && analysis.failView === view)
        unavailable();
      if (!(view in VIEW_FNS)) throw new ApiError(404, "not_found");
      checkRequest(f);
      coldChecks(f);
      const out = VIEW_FNS[view](win(f)) as ViewOut[V];
      return { ...withDrillKeys(view, out, f), history: history(f) };
    },
    async listPatients({
      drill,
      level,
      filters: asked,
    }): Promise<DeidentifiedPatientsOut> {
      await wait();
      gate();
      if (analysis === "unavailable") unavailable();
      checkRequest(asked);
      const filters = win(asked);
      // Names are only ever a POST (the purpose stays out of URLs).
      if (level !== "deidentified")
        throw new ApiError(422, "level_not_supported");
      const shown = shownDrills(filters).get(drill);
      if (!shown) throw new ApiError(422, "too_small");
      const hit = population(filters).filter(matcher(shown.token, filters));
      // Nothing is computed for a list: it must be the cell it came from.
      if (hit.length !== shown.cell || hit.length < SMALL_GROUP_MIN)
        throw new ApiError(422, "too_small");
      // Core's rows: the first 200 patients by subject, then by pid.
      const sent = [...hit]
        .sort((a, b) => a.pid.localeCompare(b.pid))
        .slice(0, PATIENT_ROWS_MAX)
        .map((p) => ({ p, pid: pidFor(p, filters, "deidentified") }))
        .sort((a, b) => a.pid.localeCompare(b.pid));
      admitList(
        (await me())?.toLowerCase() ?? "",
        asked.period,
        sent.map((x) => x.p.pid),
      );
      const patients = sent.map((x) => rowOf(x.p, filters));
      recordAudit({
        at: new Date(now()).toISOString(),
        type: "security",
        kind: "analysis_patients_viewed",
        actor: { display_name: actor },
        target: null,
        specialty: null,
        confidence: null,
        device: null,
        // Core sends no count on activity (1.24.0).
        count: null,
        flag: null,
      });
      return { level, count: shown.cell, patients };
    },
    async listNamedPatients(q, opts) {
      await wait();
      if (analysis === "unavailable") unavailable();
      const key = opts?.idempotencyKey;
      if (!key) return fail(422, "invalid");
      gate();
      checkRequest(q.filters);
      const p = await person();
      const t = now();
      // A key is bound to the caller and the request. A replay is the same
      // view: every check runs again, but it records nothing new and keeps
      // the original named_until. A spent key is never renewed.
      const print = fingerprint(p?.id ?? null, q);
      const before = viewed.get(key);
      if (before && before.print !== print)
        return fail(422, "idempotency_mismatch");
      if (before && before.namedUntil <= t) return fail(409, "expired");
      const out = await namedPatients(p, q, !before);
      if (!before) {
        viewed.set(key, { print, namedUntil: Date.parse(out.named_until) });
        return out;
      }
      const until = Math.min(before.namedUntil, Date.parse(out.named_until));
      return { ...out, named_until: new Date(until).toISOString() };
    },
    async getClearanceMe() {
      await wait();
      if (analysis === "unavailable") unavailable();
      return clearanceMe();
    },
    getNamedAccess: () =>
      createMockClearances({
        now,
        me,
        delayMs,
        staff,
        namedAccess,
      }).getNamedAccess(),
  };

  /**
   * Names, as the server must give them: the switch On, an eligible person a
   * verified letter covers, and a purpose (with a note for Other). Each view
   * is one flagged security event with the count and purpose, never a name.
   */
  async function namedPatients(
    p: StaffOut | undefined,
    { drill, filters: asked, purpose, note }: NamedPatientsIn,
    record: boolean,
  ): Promise<NamedPatientsOut> {
    const filters = win(asked);
    if (namedAccess !== "on") return fail(403, "named_access_off");
    if (!eligible(p)) return fail(403, "not_cleared");
    const t = now();
    const cover = coverFor(p.id, t);
    // A letter whose end date has passed is "ended"; anything else is a change.
    if (!cover.covered)
      return fail(
        403,
        lostCover(p.id, t) === "ended" ? "clearance_ended" : "not_cleared",
      );
    if (Date.parse(cover.until) <= t) return fail(403, "clearance_ended");
    const why = PURPOSES.find((x) => x === purpose);
    const text = typeof note === "string" ? note.trim() : "";
    if (
      !why ||
      (note !== undefined && typeof note !== "string") ||
      text.length > NOTE_MAX ||
      (why === "other" && text === "")
    )
      return fail(422, "invalid");
    const shown = shownDrills(filters).get(drill);
    if (!shown) return fail(422, "too_small");
    const letter = lettersFor(p.id, t).find((c) => c.id === cover.clearance_id);
    if (!letter) return fail(403, "not_cleared");
    const hit = population(filters).filter(matcher(shown.token, filters));
    const patients = hit
      .map((x) => namedRowOf(x, filters))
      .sort((a, b) => a.pid.localeCompare(b.pid))
      .slice(0, PATIENT_ROWS_MAX);
    const until = Math.min(Date.parse(cover.until), t + NAMED_VIEW_MS);
    if (record)
      recordAudit({
        at: new Date(t).toISOString(),
        type: "security",
        kind: "analysis_named_viewed",
        actor: { display_name: p.display_name },
        target: null,
        specialty: null,
        confidence: null,
        device: null,
        // Why, never a name, an MRN or a pid; core sends no count.
        count: null,
        flag: "alert",
        purpose: why,
      });
    return {
      level: "named",
      count: hit.length,
      patients,
      named_until: new Date(until).toISOString(),
      clearance: { id: letter.id, end_date: letter.end_date },
    };
  }
}
