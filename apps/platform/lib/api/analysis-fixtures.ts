// The synthetic cohorts behind the platform Analysis sample data (Plan 12).
// Every patient is made up, and none carries a name, record number, date of
// birth or address: a patient here is only the facts the figures are counted
// from. The cohorts are built from fixed seeds with a small PRNG (no
// dependency), so the same seed gives the same cohort every time, and they
// live only in the mock's memory: no reply ever carries a patient.
//
// Months are positions 0..11 (11 is the last complete month); the mock maps
// them to calendar months with its clock. Sources are display labels, never
// a product.
import type {
  AccessEntry,
  ConditionRef,
  Coverage,
  HospitalKind,
  LocationRef,
  Setting,
  Sex,
} from "./analysis-contract";

export const MONTHS = 12;

export const CONDITIONS: ConditionRef[] = [
  { id: "e11", name: "Type 2 diabetes", icd10: "E11" },
  { id: "n18", name: "Chronic kidney disease", icd10: "N18" },
  { id: "i10", name: "Hypertension", icd10: "I10" },
  { id: "b54", name: "Malaria", icd10: "B54" },
  { id: "j18_9", name: "Pneumonia", icd10: "J18.9" },
  { id: "d57", name: "Sickle cell disease", icd10: "D57" },
  { id: "j45", name: "Asthma", icd10: "J45" },
  { id: "a15", name: "Tuberculosis", icd10: "A15" },
  { id: "unmapped", name: null, icd10: null },
];
/** The 3-character ICD-10 level across hospitals. */
export const ALL_CONDITIONS: ConditionRef[] = CONDITIONS.filter(
  (c) => c.icd10 !== null,
).map((c) => ({
  id: c.id.slice(0, 3),
  name: c.name,
  icd10: c.icd10!.slice(0, 3),
}));
export const UNMAPPED = "unmapped";
/** A condition's id at the 3-character level. */
export const allId = (id: string) => (id === UNMAPPED ? id : id.slice(0, 3));

export const LOCATIONS: LocationRef[] = [
  { id: "ward4", label: "Ward 4 (Medical)", setting: "admitted" },
  { id: "ward7", label: "Ward 7 (Paediatrics)", setting: "admitted" },
  { id: "opd", label: "Outpatient clinic", setting: "outpatient" },
  { id: "ed", label: "Emergency", setting: "emergency" },
];
export const SPECIALTIES = [
  "Cardiology",
  "Emergency medicine",
  "Endocrinology",
  "General medicine",
  "Haematology",
  "Infectious diseases",
  "Nephrology",
  "Paediatrics",
  "Respiratory",
];
export const MAIN_RECORD = { id: "main_record", label: "Main record" };
export const RESULTS_SYSTEM = { id: "results_system", label: "Results system" };

export type Profile = {
  id: string;
  kind: HospitalKind;
  coverage: Coverage;
  seed: number;
  patients: number;
  /** Whole months of data, counted back from the last complete month. */
  months: number;
  /** The weight of "no condition recorded": more means fewer cases. */
  noCondition: number;
  /** The share of patients whose condition couldn't be standardised. */
  unmapped: number;
  /** Scales a condition's weight for this hospital. */
  mix?: Partial<Record<string, number>>;
  /** Mostly children. */
  children?: boolean;
  /** How many distinct reviewers there are. */
  reviewers: number;
  sources: { id: string; label: string }[];
  /** Sickle cell cases that are planted, instead of drawn. */
  plantD57?: number;
  /** Tuberculosis cases that are planted (it is never drawn). */
  plantTb?: number;
  /** Of the planted tuberculosis cases, how many also have kidney disease. */
  plantTbCkd?: number;
};

const full = "consultations_and_records" as const;
export const PROFILES: Profile[] = [
  {
    id: "h_havana",
    kind: "general",
    coverage: full,
    seed: 11,
    patients: 1400,
    months: 12,
    noCondition: 10,
    unmapped: 0.03,
    mix: { b54: 1.1 },
    reviewers: 12,
    sources: [MAIN_RECORD, RESULTS_SYSTEM],
    plantTb: 9,
    plantTbCkd: 2,
  },
  {
    id: "h_northgate",
    kind: "general",
    coverage: full,
    seed: 12,
    patients: 1100,
    months: 12,
    noCondition: 8,
    unmapped: 0.03,
    mix: { e11: 1.4, b54: 0.6 },
    reviewers: 10,
    sources: [MAIN_RECORD, RESULTS_SYSTEM],
    plantTb: 6,
  },
  {
    id: "h_harbour",
    kind: "general",
    coverage: full,
    seed: 13,
    patients: 800,
    months: 12,
    noCondition: 12,
    unmapped: 0.03,
    mix: { b54: 1.8, i10: 0.8 },
    reviewers: 8,
    sources: [MAIN_RECORD],
    plantD57: 6,
  },
  {
    id: "h_westfield",
    kind: "general",
    coverage: full,
    seed: 14,
    patients: 600,
    months: 12,
    noCondition: 14,
    unmapped: 0.04,
    mix: { j45: 1.6, e11: 0.8 },
    reviewers: 7,
    sources: [MAIN_RECORD],
  },
  {
    id: "h_ridgeway",
    kind: "general",
    coverage: full,
    seed: 15,
    patients: 700,
    months: 12,
    noCondition: 6,
    unmapped: 0.03,
    mix: { i10: 1.3, b54: 0.5 },
    reviewers: 8,
    sources: [MAIN_RECORD],
  },
  {
    id: "h_marlow",
    kind: "general",
    coverage: full,
    seed: 16,
    patients: 500,
    months: 12,
    noCondition: 18,
    unmapped: 0.03,
    mix: { j18_9: 1.5 },
    reviewers: 6,
    sources: [MAIN_RECORD],
  },
  {
    // Joined 2 months ago: too little history to be compared.
    id: "h_fairhaven",
    kind: "general",
    coverage: full,
    seed: 17,
    patients: 260,
    months: 2,
    noCondition: 10,
    unmapped: 0.03,
    reviewers: 5,
    sources: [MAIN_RECORD],
  },
  {
    // 14% of its condition records couldn't be standardised.
    id: "h_southpoint",
    kind: "general",
    coverage: full,
    seed: 18,
    patients: 900,
    months: 12,
    noCondition: 9,
    unmapped: 0.17,
    reviewers: 9,
    sources: [MAIN_RECORD],
  },
  {
    // Small, and only its consultations: sickle cell is 3 patients here.
    id: "h_lakeside",
    kind: "general",
    coverage: "consultations",
    seed: 19,
    patients: 120,
    months: 12,
    noCondition: 10,
    unmapped: 0.03,
    reviewers: 4,
    sources: [MAIN_RECORD],
    plantD57: 3,
  },
  {
    id: "h_riverside",
    kind: "specialist",
    coverage: full,
    seed: 20,
    patients: 650,
    months: 12,
    noCondition: 8,
    unmapped: 0.03,
    children: true,
    reviewers: 7,
    sources: [MAIN_RECORD],
  },
];
/** Not in any figure: not covered by its agreement, or too new. */
export const EXCLUDED: {
  id: string;
  reason: "not_covered" | "not_enough_data";
}[] = [
  { id: "h_hilltop", reason: "not_covered" },
  { id: "h_eastbrook", reason: "not_enough_data" },
];

// --- the cohort ---

export type CohortFinding = {
  name: string | null;
  flag: "high" | "low" | "abnormal" | null;
  month: number;
};
export type CohortConsultation = {
  month: number;
  condition: string;
  confidence: "high" | "medium" | "low";
  /** Null when not rated. */
  agreed: boolean | null;
  /** The reviewer behind a rating; never sent. */
  reviewer: string | null;
  correction: "approved" | "rejected" | "waiting" | null;
};
export type CohortPatient = {
  age: number;
  sex: Sex;
  setting: Setting | null;
  location: string | null;
  specialty: string | null;
  source: string;
  /** `onset` is a month position; negative is before the data began. */
  conditions: { id: string; onset: number }[];
  /** Month positions, ascending, at least one. */
  visits: number[];
  findings: CohortFinding[];
  alerts: { severity: "critical" | "urgent" | "info"; month: number }[];
  consultations: CohortConsultation[];
};

// A small seeded PRNG (mulberry32).
function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const chance = (p: number) => next() < p;
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]!;
  const weighted = <T>(xs: readonly (readonly [T, number])[]): T => {
    const total = xs.reduce((s, [, w]) => s + w, 0);
    let r = next() * total;
    for (const [v, w] of xs) if ((r -= w) < 0) return v;
    return xs[xs.length - 1]![0];
  };
  return { next, int, chance, pick, weighted };
}

const SPECIALTY_OF: Record<string, string> = {
  i10: "Cardiology",
  e11: "Endocrinology",
  n18: "Nephrology",
  b54: "Infectious diseases",
  a15: "Infectious diseases",
  j18_9: "Respiratory",
  j45: "Respiratory",
  d57: "Haematology",
};
type FindingKind = {
  name: string | null;
  flag: CohortFinding["flag"];
};
const F = {
  kLow: { name: "Potassium", flag: "low" },
  kHigh: { name: "Potassium", flag: "high" },
  hb: { name: "Haemoglobin", flag: "low" },
  glu: { name: "Glucose", flag: "high" },
  crea: { name: "Creatinine", flag: "high" },
  wbc: { name: "White cell count", flag: "high" },
  malaria: { name: "Malaria parasites", flag: "abnormal" },
  bp: { name: "Blood pressure", flag: "high" },
  spo2: { name: "Oxygen saturation", flag: "low" },
  other: { name: null, flag: "abnormal" },
} satisfies Record<string, FindingKind>;
const FINDINGS_OF: Record<string, FindingKind[]> = {
  e11: [F.glu, F.crea],
  n18: [F.crea, F.kHigh, F.hb],
  i10: [F.kLow, F.bp],
  b54: [F.malaria, F.hb],
  j18_9: [F.wbc, F.spo2],
  j45: [F.spo2],
  d57: [F.hb],
  a15: [F.other],
  unmapped: [F.other],
};
const ANY_FINDING: FindingKind[] = Object.values(F);

/** Plan 6's hospital bands: the age is a whole number of years. */
const AGE_RANGE = {
  "0-17": [0, 17],
  "18-39": [18, 39],
  "40-64": [40, 64],
  "65-79": [65, 79],
  "80+": [80, 95],
} as const;

export function buildCohort(p: Profile): CohortPatient[] {
  const r = prng(p.seed * 7919 + 20261022);
  const first = MONTHS - p.months;
  const w = (id: string, base: number) => base * (p.mix?.[id] ?? 1);
  const out: CohortPatient[] = [];

  for (let i = 0; i < p.patients; i++) {
    const band = (
      p.children && r.chance(0.92)
        ? "0-17"
        : r.weighted<keyof typeof AGE_RANGE>([
            ["0-17", p.children ? 1 : 15],
            ["18-39", 27],
            ["40-64", 33],
            ["65-79", 17],
            ["80+", 8],
          ])
    ) as keyof typeof AGE_RANGE;
    const [lo, hi] = AGE_RANGE[band];
    const age = lo + r.int(hi - lo + 1);
    const child = age < 18;
    const sex = r.weighted<Sex>([
      ["female", 50],
      ["male", 46],
      ["other", 1],
      ["not_recorded", 3],
    ]);

    // Sickle cell and tuberculosis are planted where the plan needs exact
    // counts, so they are never drawn at those hospitals.
    const drawD57 = p.plantD57 === undefined;
    const primary = child
      ? r.weighted<string | null>([
          ["b54", w("b54", 30)],
          ["j18_9", w("j18_9", 25)],
          ["j45", w("j45", 25)],
          ["d57", drawD57 ? 15 : 0],
          [null, 5],
        ])
      : r.weighted<string | null>([
          ["i10", w("i10", 30)],
          ["e11", w("e11", 22)],
          ["b54", w("b54", 12)],
          ["j18_9", w("j18_9", 8)],
          ["j45", w("j45", 7)],
          ["n18", w("n18", 8)],
          ["d57", drawD57 ? 3 : 0],
          [null, p.noCondition],
        ]);
    const ids: string[] = [];
    if (primary) ids.push(primary);
    if (
      (primary === "e11" && r.chance(0.55)) ||
      (primary === "n18" && r.chance(0.7))
    )
      ids.push("i10");
    if (r.chance(p.unmapped)) ids.push(UNMAPPED);

    const setting = r.weighted<Setting | null>(
      child
        ? [
            ["admitted", 30],
            ["outpatient", 40],
            ["emergency", 25],
            [null, 5],
          ]
        : [
            ["admitted", 35],
            ["outpatient", 45],
            ["emergency", 15],
            [null, 5],
          ],
    );
    let location: string | null = null;
    if (setting === "admitted") location = child ? "ward7" : "ward4";
    if (setting === "outpatient") location = "opd";
    if (setting === "emergency") location = "ed";
    if (location && r.chance(0.07)) location = null;
    const specialty: string | null = r.chance(0.06)
      ? null
      : child && r.chance(0.6)
        ? "Paediatrics"
        : ids[0]
          ? (SPECIALTY_OF[ids[0]] ?? "General medicine")
          : setting === "emergency"
            ? "Emergency medicine"
            : "General medicine";
    const source =
      p.sources.length > 1 && r.chance(0.35)
        ? p.sources[1]!.id
        : p.sources[0]!.id;

    const nVisits = 1 + Math.floor(r.next() ** 2 * 6);
    const visits = [
      ...new Set(
        Array.from({ length: nVisits }, () => first + r.int(p.months)),
      ),
    ].sort((a, b) => a - b);

    const conditions = ids.map((id) => ({
      id,
      onset: r.chance(0.55) ? -1 - r.int(40) : r.pick(visits),
    }));

    const findings: CohortFinding[] = [];
    const alerts: CohortPatient["alerts"] = [];
    for (const month of visits) {
      const pool = conditions
        .filter((c) => c.onset <= month)
        .flatMap((c) => FINDINGS_OF[c.id] ?? []);
      const nF = r.int(3);
      for (let k = 0; k < nF; k++) {
        const kind =
          pool.length > 0 && !r.chance(0.25)
            ? r.pick(pool)
            : r.pick(ANY_FINDING);
        findings.push({ name: kind.name, flag: kind.flag, month });
        if (r.chance(0.22))
          alerts.push({
            severity: r.weighted<"critical" | "urgent" | "info">([
              ["critical", 15],
              ["urgent", 40],
              ["info", 45],
            ]),
            month,
          });
      }
    }

    const consultations: CohortConsultation[] = [];
    if (conditions.length > 0) {
      const nC = r.int(4);
      for (let k = 0; k < nC; k++) {
        const month = r.pick(visits);
        const known = conditions.filter((c) => c.onset <= month);
        if (known.length === 0) continue;
        const rated = r.chance(0.5);
        consultations.push({
          month,
          condition: r.pick(known).id,
          confidence: r.weighted<"high" | "medium" | "low">([
            ["high", 60],
            ["medium", 22],
            ["low", 18],
          ]),
          agreed: rated ? r.chance(0.88) : null,
          reviewer: rated ? `r${r.int(p.reviewers)}` : null,
          correction: r.chance(0.08)
            ? r.weighted<"approved" | "rejected" | "waiting">([
                ["approved", 50],
                ["rejected", 30],
                ["waiting", 20],
              ])
            : null,
        });
      }
    }

    out.push({
      age,
      sex,
      setting,
      location,
      specialty,
      source,
      conditions,
      visits,
      findings,
      alerts,
      consultations,
    });
  }

  // Planted cases: the first patients get the condition, known from their
  // first visit, so every period that includes it counts them.
  const plant = (from: number, n: number, id: string) => {
    for (let i = from; i < from + n; i++) {
      const pt = out[i]!;
      pt.conditions = pt.conditions.filter((c) => c.id !== id);
      pt.conditions.push({ id, onset: pt.visits[0]! });
    }
  };
  if (p.plantD57) plant(0, p.plantD57, "d57");
  if (p.plantTb) {
    plant(10, p.plantTb, "a15");
    // Kidney disease only where it is planted: the rare pair is exactly the
    // planted patients, nobody else.
    const ckd = p.plantTbCkd ?? 0;
    for (let i = 10 + ckd; i < 10 + p.plantTb; i++)
      out[i]!.conditions = out[i]!.conditions.filter((c) => c.id !== "n18");
  }
  if (p.plantTbCkd) plant(10, p.plantTbCkd, "n18");
  return out;
}

const cohorts = new Map<string, CohortPatient[]>();
/** The hospital's cohort, built once. */
export function cohortOf(id: string): CohortPatient[] {
  let c = cohorts.get(id);
  if (!c) {
    const p = PROFILES.find((x) => x.id === id);
    if (!p) throw new Error(`no cohort for ${id}`);
    c = buildCohort(p);
    cohorts.set(id, c);
  }
  return c;
}

/** The trail the demo starts with: one of each kind, so it reads in full. */
export function seedAccess(now: number): AccessEntry[] {
  const H = 3_600_000;
  const ADA = { id: "tm_ada", name: "Ada Bakare" };
  const TUNDE = { id: "tm_tunde", name: "Tunde Okafor" };
  const HAVANA = { id: "h_havana", name: "Havana Hospital" };
  const at = (ago: number) => new Date(now - ago).toISOString();
  const base = {
    flagged: false,
    count: null,
    clearance_id: null,
  } as const;
  return [
    {
      ...base,
      id: "aa_seed3",
      at: at(2 * H),
      actor: ADA,
      kind: "patient_list",
      scope: "hospital",
      hospital: HAVANA,
      view: "findings",
      period: "12m",
      filters: [{ key: "condition", label: "Type 2 diabetes" }],
      count: 38,
      clearance_id: "cl_act",
      flagged: true,
    },
    {
      ...base,
      id: "aa_seed2",
      at: at(26 * H),
      actor: TUNDE,
      kind: "download",
      scope: "hospital",
      hospital: HAVANA,
      view: "quality",
      period: "6m",
      filters: [],
    },
    {
      ...base,
      id: "aa_seed1",
      at: at(27 * H),
      actor: ADA,
      kind: "visit",
      scope: "all",
      hospital: null,
      view: "prevalence",
      period: "12m",
      filters: [{ key: "sex", label: "Female" }],
    },
  ];
}
