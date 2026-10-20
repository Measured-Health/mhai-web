import type { MhaiClient } from "./client";
import type {
  CorrectionConsultationOut,
  CorrectionOriginalOut,
  QueryCreateIn,
  Stage,
} from "./contract";
import { FIXTURES } from "./fixtures";
import { createMockCorrections } from "./mock-corrections";

type Scenario = keyof typeof FIXTURES | "failed";
const ORDER: Stage[] = [
  "pii_masking",
  "retrieval",
  "generation",
  "nli_verification",
  "hga_verification",
  "decision",
];

// Whole words only, so everyday clinical wording ("heart failure", "review
// his medications") gets the normal demo result.
const has = (t: string, ...words: string[]) =>
  words.some((w) => new RegExp(`\\b${w}\\b`, "i").test(t));

export function pickScenario(q: QueryCreateIn): Scenario {
  const t = q.clinical_question;
  if (has(t, "fail")) return "failed";
  if (has(t, "potassium")) return "review";
  if (has(t, "fever", "dengue")) return "caution";
  return "high";
}

const NO_ORIGINAL: CorrectionOriginalOut = {
  decision: "PASS",
  degraded: false,
  diagnosis: null,
  icd10_code: null,
  response_text: "",
  citations: [],
};
const NO_CONSULTATION: CorrectionConsultationOut = {
  age: 0,
  sex: "unknown",
  symptoms: [],
  clinical_question: "",
  urgency: "routine",
  specialty: null,
};

function originalFor(s: Scenario | undefined): CorrectionOriginalOut {
  if (!s || s === "failed") return NO_ORIGINAL;
  const r = FIXTURES[s];
  return {
    decision: r.decision,
    degraded: r.degraded,
    diagnosis: r.diagnosis,
    icd10_code: r.icd10_code,
    response_text: r.response_text,
    citations: r.citations.map(({ source_title, claim_text, action }) => ({
      source_title,
      claim_text,
      action,
    })),
  };
}

const consultationFor = (
  q: QueryCreateIn | undefined,
): CorrectionConsultationOut =>
  q
    ? {
        age: q.patient_data.age,
        sex: q.patient_data.sex,
        symptoms: [...q.patient_data.symptoms],
        clinical_question: q.clinical_question,
        urgency: q.urgency,
        specialty: q.specialty ?? null,
      }
    : NO_CONSULTATION;

export function createMockClient({
  stepMs = 1500,
  now = () => Date.now(),
  decideAfterMs,
}: {
  stepMs?: number;
  now?: () => number;
  decideAfterMs?: number;
} = {}): MhaiClient {
  // In memory only: never persisted (CONTRIBUTING: no PHI in browser storage).
  const jobs = new Map<
    string,
    { started: number; scenario: Scenario; q: QueryCreateIn }
  >();
  const corrections = createMockCorrections({ now, decideAfterMs });
  let n = 0;
  return {
    async createQuery(q) {
      const id = `mock-${++n}-${Math.random().toString(36).slice(2, 8)}`;
      jobs.set(id, { started: now(), scenario: pickScenario(q), q });
      return { query_id: id };
    },
    async getStatus(id) {
      const j = jobs.get(id);
      if (!j) throw new Error("not_found");
      const i = Math.floor((now() - j.started) / stepMs);
      if (j.scenario === "failed" && i >= 3) {
        return {
          query_id: id,
          status: "failed",
          progress: 0.5,
          current_stage: null,
          error_code: "pipeline_timeout",
        };
      }
      if (i >= ORDER.length)
        return {
          query_id: id,
          status: "completed",
          progress: 1,
          current_stage: null,
        };
      return {
        query_id: id,
        status: i === 0 ? "queued" : "processing",
        progress: i / ORDER.length,
        current_stage: ORDER[i],
      };
    },
    async getResult(id) {
      const j = jobs.get(id);
      if (
        !j ||
        j.scenario === "failed" ||
        now() - j.started < stepMs * ORDER.length
      )
        throw new Error("result_not_ready");
      return { ...structuredClone(FIXTURES[j.scenario]), query_id: id };
    },
    async sendFeedback(f) {
      if (f.action === "validate") {
        corrections.recordAgreement();
        return { status: "recorded" };
      }
      const job = jobs.get(f.query_id);
      return {
        status: "pending_review",
        correction_id: corrections.addMine(
          f.query_id,
          f,
          originalFor(job?.scenario),
          consultationFor(job?.q),
        ),
      };
    },
    async getReadiness() {
      return { ok: true, degraded_services: [] };
    },
    listPendingCorrections: () => corrections.listPending(),
    listMyCorrections: () => corrections.listMine(),
    listMyReviews: () => corrections.listReviewed(),
    approveCorrection: (id) => corrections.approve(id),
    rejectCorrection: (id, r) => corrections.reject(id, r),
    withdrawCorrection: (id) => corrections.withdraw(id),
    getMyFeedbackStats: () => corrections.stats(),
  };
}
