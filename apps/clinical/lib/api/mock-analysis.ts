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
  FindingsOut,
  Meta,
  NamedPatientRowOut,
  NamedPatientsIn,
  NamedPatientsOut,
  NamedPurpose,
  PatientRowOut,
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
  UPDATED_AT,
  type CohortPatient,
} from "./analysis-fixtures";
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

const drillable = (g: GuardedOut, drill: string): Drillable => ({
  ...g,
  drill: !g.suppressed && (g.value ?? 0) >= SMALL_GROUP_MIN ? drill : null,
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

const demo = (p: CohortPatient, f: AnalysisFilters) =>
  (f.age_band === null || p.age_band === f.age_band) &&
  (f.sex === null || p.sex === f.sex) &&
  (f.location === null || p.location === f.location) &&
  (f.setting === null || p.setting === f.setting) &&
  (f.specialty === null || p.specialty === f.specialty) &&
  (f.source === null || p.source === f.source);
const inRange = (d: string, f: AnalysisFilters) => d >= f.from && d <= f.to;
/** The conditions in scope for a patient: known by the end of the window, and the chosen one. */
const scoped = (p: CohortPatient, f: AnalysisFilters) =>
  p.conditions.filter(
    (c) => c.onset <= f.to && (f.condition === null || c.id === f.condition),
  );

/** Patients with a visit in the window, who match every filter. */
function population(f: AnalysisFilters): CohortPatient[] {
  return COHORT.filter(
    (p) =>
      demo(p, f) &&
      p.visits.some((d) => inRange(d, f)) &&
      (f.condition === null || scoped(p, f).length > 0),
  );
}

function meta(f: AnalysisFilters, pop: CohortPatient[]): Meta {
  // Weeks up to 91 days (the "Last 90 days" preset counts both ends).
  const days = (Date.parse(f.to) - Date.parse(f.from)) / 86_400_000 + 1;
  return {
    updated_at: UPDATED_AT,
    from: f.from,
    to: f.to,
    bucket: days <= 91 ? "week" : "month",
    patients: guard(pop.length),
  };
}

function buckets(f: AnalysisFilters, kind: "week" | "month") {
  const out: { start: string; end: string }[] = [];
  let cur = Date.parse(f.from);
  const last = Date.parse(f.to);
  while (cur <= last) {
    let end: number;
    if (kind === "week") end = cur + 6 * 86_400_000;
    else {
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

/** Real days, from not after to, at most 24 months: as the server must refuse. */
function checkRange(f: AnalysisFilters) {
  const real = (d: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
  if (
    !real(f.from) ||
    !real(f.to) ||
    f.from > f.to ||
    Date.parse(f.to) - Date.parse(f.from) > 731 * 86_400_000
  )
    throw new ApiError(422, "invalid_range");
}

// --- the five views ---

function prevalence(f: AnalysisFilters): PrevalenceOut {
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
        cases: drillable(guard(r.cases), `cond-${id}`),
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

function affected(f: AnalysisFilters): AffectedOut {
  const pop = population(f);
  const m = meta(f, pop);
  /** A partition of the patients: guarded as one set against the total. */
  function part<K extends string | null>(
    key: (p: CohortPatient) => K,
    order: readonly K[] | null,
    token: (k: K) => string,
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
    by_location: part<string | null>(
      (p) => p.location,
      null,
      (l) => `loc-${l ?? "none"}`,
    ).map((r) => ({
      location: r.k === null ? null : LOCATIONS.find((l) => l.id === r.k)!,
      patients: r.patients,
    })),
    by_specialty: part<string | null>(
      (p) => p.specialty,
      null,
      (s) => `spec-${s ? slug(s) : "none"}`,
    ).map((r) => ({ specialty: r.k, patients: r.patients })),
  };
}

function pairsOf(pop: CohortPatient[], f: AnalysisFilters) {
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

function coOccurring(f: AnalysisFilters): CoOccurringOut {
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

function findings(f: AnalysisFilters): FindingsOut {
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

function quality(f: AnalysisFilters): QualityOut {
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

const VIEW_FNS: { [V in ViewId]: (f: AnalysisFilters) => ViewOut[V] } = {
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

/** Every drill the views would show for these filters: only these may be opened. */
function shownDrills(f: AnalysisFilters): Set<string> {
  const v = {
    p: prevalence(f),
    a: affected(f),
    c: coOccurring(f),
    f: findings(f),
  };
  const all: Drillable[] = [
    ...v.p.by_condition.map((r) => r.cases),
    ...v.a.by_age.map((r) => r.patients),
    ...v.a.by_sex.map((r) => r.patients),
    ...v.a.by_setting.map((r) => r.patients),
    ...v.a.by_location.map((r) => r.patients),
    ...v.a.by_specialty.map((r) => r.patients),
    ...v.c.pairs.map((r) => r.patients),
    ...v.f.findings.map((r) => r.patients),
  ];
  return new Set(all.flatMap((d) => (d.drill ? [d.drill] : [])));
}

function matcher(
  drill: string,
  f: AnalysisFilters,
): (p: CohortPatient) => boolean {
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
    case "loc":
      return (p) => (p.location ?? "none") === val;
    case "spec":
      return (p) => (p.specialty ? slug(p.specialty) : "none") === val;
    case "cond":
      return (p) => scoped(p, f).some((c) => c.id === val);
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

function rowOf(p: CohortPatient, f: AnalysisFilters): PatientRowOut {
  return {
    pid: p.pid,
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
        source_label: x.source_label,
      })),
  };
}

const namedRowOf = (
  p: CohortPatient,
  f: AnalysisFilters,
): NamedPatientRowOut => ({ ...rowOf(p, f), name: p.name, mrn: p.mrn });

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
    async getFilterOptions() {
      await wait();
      if (analysis === "unavailable") unavailable();
      return structuredClone(FILTER_OPTIONS);
    },
    async getView<V extends ViewId>(
      view: V,
      f: AnalysisFilters,
    ): Promise<ViewOut[V]> {
      await wait();
      if (analysis === "unavailable") unavailable();
      if (typeof analysis === "object" && analysis.failView === view)
        unavailable();
      if (!(view in VIEW_FNS)) throw new ApiError(404, "not_found");
      checkRange(f);
      return VIEW_FNS[view](f) as ViewOut[V];
    },
    async listPatients({
      drill,
      level,
      filters,
    }): Promise<DeidentifiedPatientsOut> {
      await wait();
      if (analysis === "unavailable") unavailable();
      checkRange(filters);
      // Names are only ever a POST (the purpose stays out of URLs).
      if (level !== "deidentified")
        throw new ApiError(422, "level_not_supported");
      if (!shownDrills(filters).has(drill))
        throw new ApiError(422, "too_small");
      const hit = population(filters).filter(matcher(drill, filters));
      const patients = hit
        .sort((a, b) => a.pid.localeCompare(b.pid))
        .slice(0, PATIENT_ROWS_MAX)
        .map((p) => rowOf(p, filters));
      recordAudit({
        at: new Date(now()).toISOString(),
        type: "security",
        kind: "analysis_patients_viewed",
        actor: { display_name: actor },
        target: null,
        specialty: null,
        confidence: null,
        device: null,
        // The rows opened (at most 200), not the patients matched.
        count: patients.length,
        flag: null,
      });
      return { level, count: hit.length, patients };
    },
    async listNamedPatients(q, opts) {
      await wait();
      if (analysis === "unavailable") unavailable();
      const key = opts?.idempotencyKey;
      if (!key) return fail(422, "invalid");
      checkRange(q.filters);
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
    { drill, filters, purpose, note }: NamedPatientsIn,
    record: boolean,
  ): Promise<NamedPatientsOut> {
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
    if (!shownDrills(filters).has(drill)) return fail(422, "too_small");
    const letter = lettersFor(p.id, t).find((c) => c.id === cover.clearance_id);
    if (!letter) return fail(403, "not_cleared");
    const hit = population(filters).filter(matcher(drill, filters));
    const patients = hit
      .sort((a, b) => a.pid.localeCompare(b.pid))
      .slice(0, PATIENT_ROWS_MAX)
      .map((x) => namedRowOf(x, filters));
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
        // The rows opened, and why: never a name, an MRN or a pid.
        count: patients.length,
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
