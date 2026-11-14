// Patient matches and exclusions for hospital admins, as core openapi
// 1.21.0 sends them (`/hospital/patient-matches`, `/hospital/patient-exclusions`).
// These carry patient names and MRNs: memory only, never stored, logged or
// put in a URL (CONTRIBUTING, "Patient data in the browser").
import type { WriteOpts } from "./contract";

export type PatientSex = "female" | "male" | "other" | "unknown";

/** One side of a possible match. */
export interface PatientCardOut {
  id: string;
  full_name: string;
  /** Null when the patient has no MRN. */
  mrn: string | null;
  age: number | null;
  sex: PatientSex;
  /** The hospital's own labels of the record systems the patient came from. */
  sources: string[];
  /** How many current records MHAI holds for the patient. */
  records: number;
}

/** Why two patients were proposed as one. */
export type MatchReason =
  "mrn_birth_sex" | "mrn_only" | "source_merge" | "document_link";

export interface PatientMatchOut {
  id: string;
  reason: MatchReason;
  a: PatientCardOut;
  b: PatientCardOut;
  proposed_at: string;
}

export interface PatientMatchesOut {
  /** Undecided, oldest first, at most 100. */
  matches: PatientMatchOut[];
}

export type ExclusionReason = "objection" | "hospital_policy" | "other";

export type ExclusionIn = ({ mrn: string } | { patient_id: string }) & {
  reason: ExclusionReason;
};

/** 202: excluded. The purge is done (or due) by `purge_by`, unless held. */
export interface ExclusionOut {
  patient_id: string;
  purge_by: string;
  /** A legal hold on the hospital keeps the data until it is lifted. */
  purge_held: boolean;
}

/** The admin's own two-step code, sent in the body. */
export type StepUpAuth = { mfaCode: string } | { backupCode: string };

/** The hospital admin's patient calls. Scoped to one hospital. */
export interface PatientsClient {
  listMatches(): Promise<PatientMatchesOut>;
  /** Merges the other patient into `keep`. 404 when decided or unknown. */
  confirmMatch(
    id: string,
    keep: "a" | "b",
    auth: StepUpAuth,
    opts: WriteOpts & { idempotencyKey: string },
  ): Promise<void>;
  /** The pair isn't proposed again for the same reason. */
  rejectMatch(
    id: string,
    auth: StepUpAuth,
    opts: WriteOpts & { idempotencyKey: string },
  ): Promise<void>;
  /** 404 no such patient; 409 `conflict` when the MRN names two. */
  excludePatient(
    body: ExclusionIn,
    auth: StepUpAuth,
    opts: WriteOpts & { idempotencyKey: string },
  ): Promise<ExclusionOut>;
}

export const EXCLUSION_REASONS: readonly ExclusionReason[] = [
  "objection",
  "hospital_policy",
  "other",
];
