// The Analysis API, hand-written from Plan 6's assumed contract. To be
// replaced by types generated from the backend OpenAPI schema. Every number
// is computed and hidden by the server under the small-group rule (a count of
// 1 to 4 is `{ value: null, suppressed: true }`), and every set that adds up
// is hidden as a set so no hidden member can be worked out. Nothing here can
// carry a date of birth or an address. Patient rows are de-identified, except
// the named list (Plan 11c), which adds only a name and an MRN, and only for
// a person a verified clearance letter covers. EMR-agnostic: sources are
// display labels only.

import type { ConfidenceLevel, GuardedOut } from "./admin-contract";
import type {
  AlertSeverity,
  DismissReason,
  FindingFlag,
} from "./alerts-contract";

export type ViewId =
  "prevalence" | "affected" | "co-occurring" | "findings" | "quality";
export type AgeBand = "0-17" | "18-39" | "40-64" | "65-79" | "80+";
export type Sex = "female" | "male" | "other" | "not_recorded";
export type Setting = "admitted" | "outpatient" | "emergency";
/** "named" needs the switch On, a covering letter and a purpose (Plan 11c). */
export type PatientLevel = "deidentified" | "named";
/** Why a person asked to see names (Plan 11c). */
export type NamedPurpose =
  "clinical_follow_up" | "quality_improvement" | "audit" | "other";

/** `name` null reads "Not standardised". */
export type ConditionRef = {
  id: string;
  name: string | null;
  icd10: string | null;
};
export type LocationRef = {
  id: string;
  label: string;
  setting: Setting | null;
};

export type AnalysisFilters = {
  /** "YYYY-MM-DD", the hospital's days. */
  from: string;
  to: string;
  condition: string | null;
  age_band: AgeBand | null;
  sex: Sex | null;
  location: string | null;
  setting: Setting | null;
  specialty: string | null;
  source: string | null;
};

/** `drill` is set only on a shown count of 5 or more. Opaque: `[A-Za-z0-9_-]+`. */
export type Drillable = GuardedOut & { drill: string | null };

export type FilterOptionsOut = {
  updated_at: string;
  conditions: ConditionRef[];
  locations: LocationRef[];
  specialties: string[];
  sources: { id: string; label: string }[];
};

export type Meta = {
  updated_at: string;
  from: string;
  to: string;
  bucket: "week" | "month";
  patients: GuardedOut;
};

export type PrevalenceOut = Meta & {
  total: { cases: GuardedOut; new: GuardedOut; existing: GuardedOut };
  by_condition: {
    condition: ConditionRef;
    cases: Drillable;
    new: GuardedOut;
    existing: GuardedOut;
  }[];
  series: { start: string; cases: GuardedOut; new: GuardedOut }[];
};

export type AffectedOut = Meta & {
  by_age: { band: AgeBand; patients: Drillable }[];
  by_sex: { sex: Sex; patients: Drillable }[];
  by_setting: { setting: Setting | null; patients: Drillable }[];
  by_location: { location: LocationRef | null; patients: Drillable }[];
  by_specialty: { specialty: string | null; patients: Drillable }[];
};

export type CoOccurringOut = Meta & {
  /** Top 20. */
  pairs: {
    a: ConditionRef;
    b: ConditionRef;
    a_patients: GuardedOut;
    patients: Drillable;
    share_of_a: GuardedOut;
  }[];
};

export type FindingsOut = Meta & {
  findings: {
    name: string | null;
    flag: FindingFlag | null;
    patients: Drillable;
    results: GuardedOut;
  }[];
  alerts: {
    total: GuardedOut;
    by_severity: Record<AlertSeverity, GuardedOut>;
    median_ack_minutes: GuardedOut;
    critical_median_ack_minutes: GuardedOut;
    dismissed: GuardedOut;
    dismiss_reasons: { reason: DismissReason; count: GuardedOut }[];
  };
};

export type QualityOut = Meta & {
  by_condition: {
    condition: ConditionRef;
    consultations: GuardedOut;
    confidence: Record<ConfidenceLevel, GuardedOut>;
    /** 0 to 1 of rated. */
    agreement_rate: GuardedOut;
    rated: GuardedOut;
    corrections: {
      total: GuardedOut;
      approved: GuardedOut;
      rejected: GuardedOut;
      waiting: GuardedOut;
    };
  }[];
};

export type ViewOut = {
  prevalence: PrevalenceOut;
  affected: AffectedOut;
  "co-occurring": CoOccurringOut;
  findings: FindingsOut;
  quality: QualityOut;
};

export type PatientRowOut = {
  /** Pseudonymous, stable within the hospital, never the MRN. */
  pid: string;
  age_band: AgeBand;
  sex: Sex;
  setting: Setting | null;
  conditions: ConditionRef[];
  findings: {
    name: string | null;
    flag: FindingFlag | null;
    source_label: string | null;
  }[];
};

/** A row of the named list: the de-identified row, plus a name and an MRN only. */
export type NamedPatientRowOut = PatientRowOut & { name: string; mrn: string };

/** `patients` is at most 200 rows. */
export type DeidentifiedPatientsOut = {
  level: "deidentified";
  count: number;
  patients: PatientRowOut[];
};

/** Names until `named_until` (ISO), and never past the letter's end. */
export type NamedPatientsOut = {
  level: "named";
  count: number;
  patients: NamedPatientRowOut[];
  named_until: string;
  /** `end_date` is the hospital's day. */
  clearance: { id: string; end_date: string };
};

export type PatientsOut = DeidentifiedPatientsOut | NamedPatientsOut;

/**
 * `GET /analysis/clearance/me`: whether this person may see names right now.
 * `until` is the ISO instant their letter's end day ends; the app does no
 * time-zone sum. Any change to `named`, `clearance_id` or `version` ends a
 * named view.
 */
export type ClearanceMeOut = {
  named: boolean;
  until: string | null;
  clearance_id: string | null;
  version: number;
  reason:
    | "none"
    | "ended"
    | "revoked"
    | "removed_from_letter"
    | "role_or_account"
    | "switched_off"
    | null;
};
