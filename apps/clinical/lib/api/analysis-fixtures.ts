// The synthetic cohort behind the Analysis sample data: about 600 made-up
// patients at the demo hospital over 12 months, built from a fixed seed (a
// small PRNG, no dependency) so the same seed gives the same cohort every
// time. Nothing here is real. Patients are a pseudonymous pid; each also has
// an invented name and record number (MRN), which only the named list (Plan
// 11c) ever sends. Sources are display labels ("Main record" and "Results
// system"), never a product.

import type { ConfidenceLevel } from "./admin-contract";
import type {
  AlertSeverity,
  DismissReason,
  FindingFlag,
} from "./alerts-contract";
import type {
  AgeBand,
  ConditionRef,
  FilterOptionsOut,
  LocationRef,
  Setting,
  Sex,
} from "./analysis-contract";

export const COHORT_SEED = 20261022;
export const COHORT_START = "2025-10-22";
export const COHORT_END = "2026-10-21";
export const UPDATED_AT = "2026-10-22T06:00:00.000Z";

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
export const SOURCES = [
  { id: "main_record", label: "Main record" },
  { id: "results_system", label: "Results system" },
];
export const FILTER_OPTIONS: FilterOptionsOut = {
  updated_at: UPDATED_AT,
  conditions: CONDITIONS,
  locations: LOCATIONS,
  specialties: SPECIALTIES,
  sources: SOURCES,
};

export type CohortFinding = {
  name: string | null;
  flag: FindingFlag | null;
  source_label: string;
  date: string;
};
export type CohortAlert = {
  severity: AlertSeverity;
  date: string;
  /** Null when not acknowledged. */
  ack_minutes: number | null;
  dismissed: DismissReason | null;
};
export type CohortConsultation = {
  date: string;
  condition: string;
  confidence: ConfidenceLevel;
  /** Null when not rated. */
  agreed: boolean | null;
  corrections: ("approved" | "rejected" | "waiting")[];
};
export type CohortPatient = {
  pid: string;
  /** Invented, from fixed lists; sent only in the named list. */
  name: string;
  /** Invented, "HH-" and six digits; sent only in the named list. */
  mrn: string;
  age_band: AgeBand;
  sex: Sex;
  setting: Setting | null;
  location: string | null;
  specialty: string | null;
  source: string;
  /** `onset` is "YYYY-MM-DD": before the cohort started, or one of the visits. */
  conditions: { id: string; onset: string }[];
  visits: string[];
  findings: CohortFinding[];
  alerts: CohortAlert[];
  consultations: CohortConsultation[];
};

// --- a small seeded PRNG (mulberry32) ---
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
  const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)];
  const weighted = <T>(xs: readonly (readonly [T, number])[]): T => {
    const total = xs.reduce((s, [, w]) => s + w, 0);
    let r = next() * total;
    for (const [v, w] of xs) if ((r -= w) < 0) return v;
    return xs[xs.length - 1][0];
  };
  return { next, int, chance, pick, weighted };
}

const DAY = 86_400_000;
const dayNum = (iso: string) =>
  Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const dayIso = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

const PID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// Invented names for the named list. None is a sample person in the demo (the
// README's, the staff or the platform team), and the pairs are made up.
const GIVEN = [
  "Ifeoma",
  "Tobenna",
  "Zainab",
  "Musa",
  "Efe",
  "Kelechi",
  "Aisha",
  "Yusuf",
  "Nneka",
  "Emeka",
  "Halima",
  "Sola",
  "Uche",
  "Fatima",
  "Obinna",
  "Ronke",
  "Ibrahim",
  "Chiamaka",
  "Dayo",
  "Hauwa",
  "Femi",
  "Adaeze",
  "Ikenna",
  "Nkechi",
] as const;
const FAMILY = [
  "Okonkwo",
  "Balogun",
  "Lawal",
  "Ibekwe",
  "Abubakar",
  "Oyelaran",
  "Nnamdi",
  "Ogbu",
  "Akande",
  "Usman",
  "Odili",
  "Bamidele",
  "Garba",
  "Chukwu",
  "Ajayi",
  "Okeke",
  "Salami",
  "Ilori",
  "Yakubu",
  "Onyeka",
  "Afolabi",
  "Danladi",
  "Etim",
  "Olowo",
  "Nwachukwu",
] as const;
/**
 * The i-th patient's name: 24 given and 25 family names pair up uniquely for
 * every i under 600. No PRNG draw, so the rest of the cohort is unchanged.
 */
const nameOf = (i: number) =>
  `${GIVEN[i % GIVEN.length]} ${FAMILY[i % FAMILY.length]}`;
/** A unique six-digit record number: 7919 shares no factor with 900000. */
const mrnOf = (i: number) => `HH-${100000 + ((i * 7919 + 4233) % 900000)}`;

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
  flag: FindingFlag | null;
  source: "Main record" | "Results system";
};
const F = {
  kLow: { name: "Potassium", flag: "low", source: "Results system" },
  kHigh: { name: "Potassium", flag: "high", source: "Results system" },
  hb: { name: "Haemoglobin", flag: "low", source: "Results system" },
  glu: { name: "Glucose", flag: "high", source: "Results system" },
  crea: { name: "Creatinine", flag: "high", source: "Results system" },
  wbc: { name: "White cell count", flag: "high", source: "Results system" },
  malaria: {
    name: "Malaria parasites",
    flag: "abnormal",
    source: "Results system",
  },
  na: { name: "Sodium", flag: "low", source: "Results system" },
  bp: { name: "Blood pressure", flag: "high", source: "Main record" },
  spo2: { name: "Oxygen saturation", flag: "low", source: "Main record" },
  other: { name: null, flag: "abnormal", source: "Main record" },
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

export function buildCohort(): CohortPatient[] {
  const r = prng(COHORT_SEED);
  const start = dayNum(COHORT_START);
  const days = dayNum(COHORT_END) - start + 1;
  const TB = new Set([17, 233, 451]);
  const used = new Set<string>();
  const out: CohortPatient[] = [];

  for (let i = 0; i < 600; i++) {
    let pid = "";
    do {
      pid = `P-${Array.from({ length: 5 }, () => PID_CHARS[r.int(36)]).join("")}`;
    } while (used.has(pid));
    used.add(pid);

    const isTb = TB.has(i);
    const age_band: AgeBand = isTb
      ? "40-64"
      : r.weighted<AgeBand>([
          ["0-17", 15],
          ["18-39", 25],
          ["40-64", 32],
          ["65-79", 20],
          ["80+", 8],
        ]);
    const child = age_band === "0-17";
    const sex: Sex = r.weighted<Sex>([
      ["female", 50],
      ["male", 46],
      ["other", 1],
      ["not_recorded", 3],
    ]);

    const ids: string[] = [];
    const primary = child
      ? r.weighted<string | null>([
          ["b54", 30],
          ["j18_9", 25],
          ["j45", 25],
          ["d57", 15],
          [null, 5],
        ])
      : r.weighted<string | null>([
          ["i10", 30],
          ["e11", 22],
          ["b54", 12],
          ["j18_9", 8],
          ["j45", 7],
          ["n18", 8],
          ["d57", 3],
          [null, 10],
        ]);
    if (primary) ids.push(primary);
    if (
      (primary === "e11" && r.chance(0.55)) ||
      (primary === "n18" && r.chance(0.7))
    )
      ids.push("i10");
    if (isTb) ids.push("a15");
    if (i % 50 === 7) ids.push("unmapped");

    const setting: Setting | null = r.weighted<Setting | null>(
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

    const nVisits = 1 + Math.floor(r.next() ** 2 * 6);
    const visits = [
      ...new Set(
        Array.from({ length: nVisits }, () => dayIso(start + r.int(days))),
      ),
    ].sort();

    const conditions = ids.map((id) => ({
      id,
      onset:
        r.chance(0.55) && !isTb
          ? dayIso(start - 1 - r.int(1000))
          : r.pick(visits),
    }));

    const findings: CohortFinding[] = [];
    const alerts: CohortAlert[] = [];
    for (const date of visits) {
      const pool = [
        ...conditions
          .filter((c) => c.onset <= date)
          .flatMap((c) => FINDINGS_OF[c.id] ?? []),
      ];
      const nF = r.int(3);
      for (let k = 0; k < nF; k++) {
        const kind =
          pool.length > 0 && !r.chance(0.25)
            ? r.pick(pool)
            : r.pick(ANY_FINDING);
        findings.push({
          name: kind.name,
          flag: kind.flag,
          source_label: kind.source,
          date,
        });
        if (r.chance(0.22)) {
          const severity = r.weighted<AlertSeverity>([
            ["critical", 15],
            ["urgent", 40],
            ["info", 45],
          ]);
          const status = r.weighted<"acked" | "dismissed" | "new">([
            ["acked", 55],
            ["dismissed", 20],
            ["new", 25],
          ]);
          const span =
            severity === "critical"
              ? [4, 40]
              : severity === "urgent"
                ? [10, 130]
                : [30, 600];
          alerts.push({
            severity,
            date,
            ack_minutes:
              status === "acked" ? span[0] + r.int(span[1] - span[0]) : null,
            dismissed:
              status === "dismissed"
                ? r.weighted<DismissReason>([
                    ["not_relevant", 40],
                    ["already_known", 35],
                    ["wrong_patient", 5],
                    ["other", 20],
                  ])
                : null,
          });
        }
      }
    }

    const consultations: CohortConsultation[] = [];
    if (conditions.length > 0) {
      const nC = r.int(4);
      for (let k = 0; k < nC; k++) {
        const date = r.pick(visits);
        const known = conditions.filter((c) => c.onset <= date);
        if (known.length === 0) continue;
        const rated = r.chance(0.5);
        const corrections: CohortConsultation["corrections"] = [];
        if (r.chance(0.08))
          corrections.push(
            r.weighted<"approved" | "rejected" | "waiting">([
              ["approved", 50],
              ["rejected", 30],
              ["waiting", 20],
            ]),
          );
        consultations.push({
          date,
          condition: r.pick(known).id,
          confidence: r.weighted<ConfidenceLevel>([
            ["high", 60],
            ["caution", 22],
            ["review", 14],
            ["failed", 4],
          ]),
          agreed: rated ? r.chance(0.88) : null,
          corrections,
        });
      }
    }

    out.push({
      pid,
      name: nameOf(i),
      mrn: mrnOf(i),
      age_band,
      sex,
      setting,
      location,
      specialty,
      source: r.chance(0.65) ? "main_record" : "results_system",
      conditions,
      visits,
      findings,
      alerts,
      consultations,
    });
  }
  return out;
}

export const COHORT: readonly CohortPatient[] = buildCohort();
