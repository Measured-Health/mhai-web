// Mirrors mhai-multiagent docs/specs/2026-10-08-api-gateway-phase1-design.md §4.2.
// Temporary: Plan 2 replaces this file with types generated from openapi.json.

export type Sex = "female" | "male" | "other" | "unknown";
export type Urgency = "routine" | "urgent" | "emergency";
export type Stage =
  | "pii_masking"
  | "retrieval"
  | "generation"
  | "nli_verification"
  | "hga_verification"
  | "decision";

export interface QueryCreateIn {
  patient_data: {
    age: number;
    sex: Sex;
    symptoms: string[];
    medical_history?: string;
  };
  clinical_question: string;
  urgency: Urgency;
  specialty?: string;
}

export interface QueryStatusOut {
  query_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number; // 0–1
  current_stage: Stage | null;
  error_code?: string;
}

export interface Citation {
  chunk_id: string;
  source_title: string;
  excerpt: string;
  claim_text: string;
  nli_label: "ENTAILMENT" | "NEUTRAL" | "CONTRADICTION";
  nli_confidence: number;
  action: "PASS" | "FLAG" | "REDACT";
  reason: string;
}

export interface ClinicalResultOut {
  query_id: string;
  decision: "PASS" | "REGENERATE" | "ESCALATE";
  verified: boolean;
  degraded: boolean;
  failed_agents: ("CCA" | "HGA")[];
  response_available: boolean;
  diagnosis: string | null;
  icd10_code: string | null;
  response_text: string;
  trust_score: number | null;
  citations: Citation[];
  guardrail_details: {
    l1_persona: null;
    l2_entropy: { stability: number } | null;
    l3_nli: {
      pass_rate: number;
      claims_checked: number;
      model_loaded: boolean;
    };
    l4_trust: {
      trust_score: number;
      base_trust: number;
      flag_penalty: number;
    } | null;
    cascade_pass: boolean;
  };
  retrieval_ms: number;
  generation_ms: number;
}

export type FeedbackIn =
  | { query_id: string; action: "validate" }
  | {
      query_id: string;
      action: "correct";
      corrected_diagnosis: string;
      reason: string;
    };

export interface FeedbackOut {
  /** `queued` is frontend-only: saved for sync. */
  status: "recorded" | "pending_review" | "queued";
  correction_id?: string;
}

export interface Readiness {
  ok: boolean;
  degraded_services: string[];
}

// ── Corrections (Plan 3). Fields beyond the backend's `corrections` table
// are the assumed contract in spec §10 item 1. ──

/** `withdrawn` and `rejected` are assumed; the table has the other two. */
export type CorrectionStatus =
  "pending_review" | "approved" | "rejected" | "withdrawn";

export type RejectReasonCode =
  "not_supported" | "needs_rewording" | "unsafe" | "out_of_scope";

/** A person as the API shows them: never an id (CONTRIBUTING). */
export interface PersonOut {
  display_name: string;
  full_name: string | null;
  specialty: string | null;
  hospital: string | null;
}

/** What the system said, embedded because the reviewer can't load the result. */
export interface CorrectionOriginalOut {
  decision: ClinicalResultOut["decision"];
  degraded: boolean;
  diagnosis: string | null;
  icd10_code: string | null;
  response_text: string;
  citations: Pick<Citation, "source_title" | "claim_text" | "action">[];
}

/** The consultation as it was asked (patient details already masked). */
export interface CorrectionConsultationOut {
  age: number;
  sex: Sex;
  symptoms: string[];
  clinical_question: string;
  urgency: Urgency;
  specialty: string | null;
}

export interface CorrectionOut {
  id: string;
  query_id: string;
  status: CorrectionStatus;
  corrected_diagnosis: string;
  reason: string;
  submitted_by: PersonOut;
  /** ISO 8601. */
  submitted_at: string;
  original: CorrectionOriginalOut;
  consultation: CorrectionConsultationOut;
  decided_by: PersonOut | null;
  /** ISO 8601; also set when withdrawn. */
  decided_at: string | null;
  rejection: { reason_code: RejectReasonCode; note: string | null } | null;
}

export interface RejectIn {
  reason_code: RejectReasonCode;
  /** At most 500 characters; omitted when empty. */
  note?: string;
}

export interface FeedbackStatsOut {
  agreed: number;
  corrections_waiting: number;
  corrections_approved: number;
  corrections_rejected: number;
  corrections_withdrawn: number;
}

/** Options for a write that may be retried or sent while leaving the page. */
export interface WriteOpts {
  idempotencyKey?: string;
  keepalive?: boolean;
}
