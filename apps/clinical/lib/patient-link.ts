// The patient a question is about (core openapi 1.22.0, `POST /queries`
// `patient_id`). The link is in memory only: never in a URL, storage, a log,
// analytics or the offline outbox (CONTRIBUTING, "Patient data in the
// browser"). The name and MRN are what the clinician already saw on the
// alert they started from; only the id is sent.

/** A canonical lower-case uuid, never the nil one: core answers 422 otherwise. */
const PATIENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIL = "00000000-0000-0000-0000-000000000000";

export const isPatientId = (v: unknown): v is string =>
  typeof v === "string" && PATIENT_ID.test(v) && v !== NIL;

export interface PatientLink {
  /** MHAI's patient id, from the alert. */
  id: string;
  /** As the alert showed it. */
  name: string;
  /** As the alert showed it; null for a patient with no MRN. */
  mrn: string | null;
}
