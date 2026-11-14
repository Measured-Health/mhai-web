// Plain words for the patient matches and exclusions screens. Never a
// backend code, a rule name or a record system's product name.
import { ApiError } from "../api/errors";
import type {
  ExclusionReason,
  MatchReason,
  PatientSex,
} from "../api/patients-contract";
import { adminError, type AdminError } from "./errors";

export const MATCH_REASON: Record<MatchReason, string> = {
  mrn_birth_sex: "Same MRN, date of birth and sex",
  mrn_only: "Same MRN, but other details differ or are missing",
  source_merge: "A record system merged these two patients",
  document_link: "A reviewed document links these two patients",
};

export const SEX_LABEL: Record<PatientSex, string> = {
  female: "Female",
  male: "Male",
  other: "Other",
  unknown: "Sex not recorded",
};

export const EXCLUSION_REASON: Record<ExclusionReason, string> = {
  objection: "The patient objected",
  hospital_policy: "Hospital policy",
  other: "Another reason",
};

export const MATCHES_INTRO =
  "MHAI found patients who may be the same person in different records. Nothing is merged unless you confirm it. Check each pair against the hospital's own records before you decide.";

export const EXCLUSION_INTRO =
  "Excluding a patient stops MHAI using their records. Their open alerts are withdrawn at once, no new alerts are raised for them, and the record data MHAI holds for them is deleted. If a legal hold is open on the hospital, the patient is still excluded at once, but the deletion waits until the hold is lifted and then happens within 24 hours.";

/**
 * Plain words for a refusal on these screens. The patient-specific ones
 * here, the rest as every admin screen says them.
 */
export function patientError(
  e: unknown,
  what: "match" | "exclusion",
): AdminError {
  if (e instanceof ApiError) {
    const E = (title: string, body: string, gone = false): AdminError => ({
      title,
      body,
      gone,
      stale: false,
      unavailable: false,
    });
    if (e.status === 404)
      return what === "match"
        ? E(
            "This match is no longer waiting",
            "Someone else may have decided it. The list has been refreshed.",
            true,
          )
        : E(
            "No patient found",
            "No current patient of this hospital has that MRN. Check it and try again.",
          );
    if (e.status === 409 && what === "exclusion")
      return E(
        "Two patients share this MRN",
        "Decide the possible match under Patient matches first, then try again.",
      );
    if (e.status === 503 && e.code === "not_ready")
      return E(
        "MHAI is busy with the record feed",
        "Nothing was changed. Try again in a moment.",
      );
  }
  return adminError(e);
}
