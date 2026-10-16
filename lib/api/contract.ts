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
