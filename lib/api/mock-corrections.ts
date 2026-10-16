import type {
  ClinicalResultOut,
  CorrectionConsultationOut,
  CorrectionOriginalOut,
  CorrectionOut,
  CorrectionStatus,
  FeedbackStatsOut,
  PersonOut,
  RejectIn,
  Sex,
  Urgency,
} from "./contract";
import { ApiError } from "./errors";

/** A correction you send in the demo gets a decision this long after. */
export const MOCK_DECIDE_AFTER_MS = 120_000;

const MIN = 60_000;
const H = 60 * MIN;

/** The sample people of lib/auth/mock.ts, as the API would show them. */
export const MOCK_PEOPLE = {
  okafor: {
    display_name: "Dr. Okafor",
    full_name: "Dr. Chidi Okafor",
    specialty: "Paediatrics",
    hospital: "Havana Hospital",
  },
  bello: {
    display_name: "Nurse Bello",
    full_name: "Amina Bello",
    specialty: "General ward",
    hospital: "Havana Hospital",
  },
  reyes: {
    display_name: "Dr. Reyes",
    full_name: "Dr. Ana Reyes",
    specialty: "Internal Medicine",
    hospital: "Havana Hospital",
  },
} satisfies Record<string, PersonOut>;

/** One stored correction plus who it belongs to (never sent to the UI). */
interface Row {
  c: CorrectionOut;
  /** Submitted by the signed-in person. */
  mine: boolean;
  /** Decided by the signed-in person. */
  reviewedByMe: boolean;
  /** Sent in this demo session: decided after `decideAfterMs`. */
  auto: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString();

const consult = (
  age: number,
  sex: Sex,
  symptoms: string[],
  clinical_question: string,
  urgency: Urgency,
  specialty: string,
): CorrectionConsultationOut => ({
  age,
  sex,
  symptoms,
  clinical_question,
  urgency,
  specialty,
});

const said = (
  decision: ClinicalResultOut["decision"],
  diagnosis: string,
  icd10_code: string | null,
  response_text: string,
  citations: CorrectionOriginalOut["citations"],
): CorrectionOriginalOut => ({
  decision,
  degraded: false,
  diagnosis,
  icd10_code,
  response_text,
  citations,
});

interface Seed {
  id: string;
  at: number;
  by: PersonOut;
  corrected: string;
  reason: string;
  original: CorrectionOriginalOut;
  consultation: CorrectionConsultationOut;
  status?: CorrectionStatus;
  decided?: { by: PersonOut; at: number };
  rejection?: CorrectionOut["rejection"];
}

function make(s: Seed): CorrectionOut {
  return {
    id: s.id,
    query_id: `q-${s.id}`,
    status: s.status ?? "pending_review",
    corrected_diagnosis: s.corrected,
    reason: s.reason,
    submitted_by: s.by,
    submitted_at: iso(s.at),
    original: s.original,
    consultation: s.consultation,
    decided_by: s.decided?.by ?? null,
    decided_at: s.decided ? iso(s.decided.at) : null,
    rejection: s.rejection ?? null,
  };
}

const row = (s: Seed, flags: Partial<Omit<Row, "c">> = {}): Row => ({
  c: make(s),
  mine: false,
  reviewedByMe: false,
  auto: false,
  ...flags,
});

/** Synthetic sample corrections, timed relative to `t` (no real patients). */
function seed(t: number): Row[] {
  const { okafor, bello, reyes } = MOCK_PEOPLE;
  return [
    row({
      id: "c-asthma",
      at: t - 6 * H,
      by: okafor,
      corrected: "Acute asthma, severe",
      reason:
        "SpO2 under 92% and unable to complete sentences make this severe under BTS/SIGN.",
      original: said(
        "PASS",
        "Acute asthma, moderate",
        "J45.9",
        "Moderate acute asthma.\n- Salbutamol by spacer, 10 puffs\n- Oral prednisolone",
        [
          {
            source_title: "BTS/SIGN Asthma Guideline 2019",
            claim_text: "Salbutamol by spacer, 10 puffs",
            action: "PASS",
          },
        ],
      ),
      consultation: consult(
        7,
        "male",
        ["Wheeze", "Shortness of breath"],
        "Wheeze, SpO2 91%, can't finish sentences. How severe?",
        "emergency",
        "Paediatrics",
      ),
    }),
    row({
      id: "c-potassium",
      at: t - 3 * H,
      by: bello,
      corrected: "Hypokalaemia, likely from diuretic use",
      reason:
        "On furosemide 80 mg daily. Give at most 10 mmol an hour through a peripheral line.",
      original: said(
        "ESCALATE",
        "Hypokalaemia, cause unclear",
        "E87.6",
        "Low potassium on routine bloods.\n- IV potassium 40 mmol over 1 hour via a peripheral line",
        [
          {
            source_title: "BNF: Potassium chloride",
            claim_text:
              "IV potassium 40 mmol over 1 hour via a peripheral line",
            action: "REDACT",
          },
        ],
      ),
      consultation: consult(
        67,
        "male",
        ["Weakness"],
        "Potassium 2.9 on routine bloods. Plan?",
        "routine",
        "Internal Medicine",
      ),
    }),
    row({
      id: "c-dengue",
      at: t - 42 * MIN,
      by: okafor,
      corrected: "Dengue fever with warning signs: admit",
      reason:
        "Persistent vomiting and abdominal pain are warning signs. WHO 2024 admits on warning signs, not on a platelet cut-off alone.",
      original: said(
        "REGENERATE",
        "Dengue fever, likely",
        "A90",
        "Febrile illness with rash in an endemic area.\n- Admit if platelets fall below 100 × 10⁹/L",
        [
          {
            source_title: "WHO Dengue Guidelines 2024",
            claim_text: "NS1 antigen test and full blood count",
            action: "PASS",
          },
          {
            source_title: "WHO Dengue Guidelines 2024",
            claim_text: "Admit if platelets fall below 100 × 10⁹/L",
            action: "FLAG",
          },
        ],
      ),
      consultation: consult(
        24,
        "female",
        ["Fever", "Rash"],
        "Fever 3 days and rash, dengue area. Admit?",
        "urgent",
        "Infectious disease",
      ),
    }),
    row(
      {
        id: "c-seizure",
        at: t - 5 * H,
        by: reyes,
        corrected: "Febrile seizure, complex",
        reason: "It lasted 18 minutes. Over 15 minutes makes it complex.",
        original: said(
          "REGENERATE",
          "Febrile seizure, simple",
          "R56.0",
          "Seizure with fever in a young child.\n- Treat the fever and look for its source",
          [
            {
              source_title: "NICE Fever in under 5s",
              claim_text: "Treat the fever and look for its source",
              action: "PASS",
            },
          ],
        ),
        consultation: consult(
          3,
          "female",
          ["Seizure", "Fever"],
          "Febrile child, seizure for 18 minutes. Simple or complex?",
          "urgent",
          "Paediatrics",
        ),
      },
      { mine: true },
    ),
    row(
      {
        id: "c-nstemi",
        at: t - 26 * H,
        by: reyes,
        corrected: "NSTEMI",
        reason: "Troponin rose on the repeat test at 3 hours.",
        original: said(
          "PASS",
          "Unstable angina",
          "I20.0",
          "Acute coronary syndrome likely.\n- Serial high-sensitivity troponin at 0 and 3 hours",
          [
            {
              source_title: "ESC 2023 ACS Guideline",
              claim_text: "Serial high-sensitivity troponin at 0 and 3 hours",
              action: "PASS",
            },
          ],
        ),
        consultation: consult(
          54,
          "male",
          ["Chest pain"],
          "Central chest pain 40 min radiating to the left arm. Diagnosis?",
          "urgent",
          "Cardiology",
        ),
        status: "approved",
        decided: { by: okafor, at: t - 20 * H },
      },
      { mine: true },
    ),
    row(
      {
        id: "c-vomiting",
        at: t - 48 * H,
        by: reyes,
        corrected: "Hypokalaemia from vomiting",
        reason: "Two days of vomiting explain it.",
        original: said(
          "ESCALATE",
          "Hypokalaemia, cause unclear",
          "E87.6",
          "Low potassium after vomiting.\n- Check magnesium\n- Oral replacement if able to keep it down",
          [],
        ),
        consultation: consult(
          71,
          "female",
          ["Vomiting"],
          "Potassium 3.0 after 2 days of vomiting. Cause?",
          "routine",
          "Internal Medicine",
        ),
        status: "rejected",
        decided: { by: bello, at: t - 26 * H },
        rejection: {
          reason_code: "needs_rewording",
          note: 'Keep "cause unclear" until the magnesium result is back, and mention cardiac monitoring.',
        },
      },
      { mine: true },
    ),
    row(
      {
        id: "c-warfarin",
        at: t - 5 * H,
        by: okafor,
        corrected:
          "Warfarin over-anticoagulation from a clarithromycin interaction",
        reason:
          "Clarithromycin slows warfarin breakdown; INR 6 after starting it.",
        original: said(
          "REGENERATE",
          "Warfarin over-anticoagulation",
          null,
          "INR above range.\n- Withhold warfarin and recheck INR",
          [],
        ),
        consultation: consult(
          62,
          "male",
          ["Bleeding gums"],
          "On warfarin, started clarithromycin, INR 6. Plan?",
          "urgent",
          "Internal Medicine",
        ),
        status: "approved",
        decided: { by: reyes, at: t - 2 * H },
      },
      { reviewedByMe: true },
    ),
  ];
}

/** The demo's corrections: memory only, never stored (CONTRIBUTING). */
export function createMockCorrections({
  now,
  decideAfterMs = MOCK_DECIDE_AFTER_MS,
}: {
  now: () => number;
  decideAfterMs?: number;
}) {
  const t0 = now();
  const rows = seed(t0);
  let agreed = 42;
  let n = 0;

  const out = (r: Row): CorrectionOut => structuredClone(r.c);
  const newest = (a: Row, b: Row) =>
    Date.parse(b.c.decided_at ?? b.c.submitted_at) -
    Date.parse(a.c.decided_at ?? a.c.submitted_at);

  // Corrections sent in this session get a reviewer's decision after a while.
  function settle() {
    const t = now();
    for (const r of rows) {
      if (!r.auto || r.c.status !== "pending_review") continue;
      const at = Date.parse(r.c.submitted_at) + decideAfterMs;
      if (t < at) continue;
      r.c.decided_at = iso(at);
      if (/\bunsure\b/i.test(r.c.reason)) {
        r.c.status = "rejected";
        r.c.decided_by = MOCK_PEOPLE.bello;
        r.c.rejection = {
          reason_code: "needs_rewording",
          note: "Please add the guideline you used.",
        };
      } else {
        r.c.status = "approved";
        r.c.decided_by = MOCK_PEOPLE.okafor;
      }
    }
  }

  function find(id: string): Row {
    const r = rows.find((x) => x.c.id === id);
    if (!r) throw new ApiError(404, "not_found");
    return r;
  }
  function decidable(id: string): Row {
    const r = find(id);
    if (r.mine) throw new ApiError(403, "self_approval");
    if (r.c.status !== "pending_review")
      throw new ApiError(409, "already_decided");
    return r;
  }
  function decide(r: Row) {
    r.c.decided_by = MOCK_PEOPLE.reyes;
    r.c.decided_at = iso(now());
    r.reviewedByMe = true;
  }
  const count = (s: CorrectionStatus) =>
    rows.filter((r) => r.mine && r.c.status === s).length;

  return {
    async listPending(): Promise<CorrectionOut[]> {
      settle();
      return rows
        .filter((r) => !r.mine && r.c.status === "pending_review")
        .map(out);
    },
    async listMine(): Promise<CorrectionOut[]> {
      settle();
      return rows
        .filter((r) => r.mine)
        .sort(newest)
        .map(out);
    },
    async listReviewed(): Promise<CorrectionOut[]> {
      return rows
        .filter((r) => r.reviewedByMe)
        .sort(newest)
        .map(out);
    },
    async approve(id: string): Promise<void> {
      const r = decidable(id);
      r.c.status = "approved";
      decide(r);
    },
    async reject(id: string, x: RejectIn): Promise<void> {
      const r = decidable(id);
      r.c.status = "rejected";
      r.c.rejection = {
        reason_code: x.reason_code,
        note: x.note?.trim() || null,
      };
      decide(r);
    },
    async withdraw(id: string): Promise<void> {
      const r = find(id);
      if (!r.mine) throw new ApiError(403, "forbidden");
      if (r.c.status !== "pending_review")
        throw new ApiError(409, "already_decided");
      r.c.status = "withdrawn";
      r.c.decided_at = iso(now());
    },
    async stats(): Promise<FeedbackStatsOut> {
      settle();
      return {
        agreed,
        corrections_waiting: count("pending_review"),
        corrections_approved: count("approved"),
        corrections_rejected: count("rejected"),
        corrections_withdrawn: count("withdrawn"),
      };
    },
    recordAgreement() {
      agreed++;
    },
    /** A correction sent in this session; returns its id. */
    addMine(
      query_id: string,
      f: { corrected_diagnosis: string; reason: string },
      original: CorrectionOriginalOut,
      consultation: CorrectionConsultationOut,
    ): string {
      const id = `c-${++n}-${t0.toString(36)}`;
      rows.push({
        c: {
          id,
          query_id,
          status: "pending_review",
          corrected_diagnosis: f.corrected_diagnosis,
          reason: f.reason,
          submitted_by: MOCK_PEOPLE.reyes,
          submitted_at: iso(now()),
          original,
          consultation,
          decided_by: null,
          decided_at: null,
          rejection: null,
        },
        mine: true,
        reviewedByMe: false,
        auto: true,
      });
      return id;
    },
  };
}

export type MockCorrections = ReturnType<typeof createMockCorrections>;
