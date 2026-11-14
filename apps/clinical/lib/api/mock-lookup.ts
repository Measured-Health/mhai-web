import { ApiError } from "./errors";
import type { LookupClient } from "./lookup";
import { mrnProblem, normaliseMrn, type PatientFound } from "./lookup-schema";
import { MOCK_HOSPITAL_PATIENTS } from "./mock-alerts";

const MINUTE = 60_000;

/** Core 1.29.0's defaults: per clinician a minute and a day, per hospital a day. */
export const MOCK_LOOKUP_LIMITS = {
  perMinute: 5,
  perDay: 50,
  hospitalPerDay: 1000,
} as const;

/**
 * Two synthetic records that share one MRN (a records problem the hospital
 * hasn't fixed yet): looking it up is 409 `conflict`, never either patient.
 */
export const MOCK_SHARED_MRN = "990417";
const SHARED: PatientFound[] = [
  {
    id: "6f1c2b01-5e1d-4c3b-9a7e-000000000101",
    full_name: "Adaeze Sample-Eze",
    mrn: MOCK_SHARED_MRN,
    age: 33,
    sex: "female",
  },
  {
    id: "6f1c2b02-5e1d-4c3b-9a7e-000000000102",
    full_name: "Adaeze Eze",
    mrn: MOCK_SHARED_MRN,
    age: null,
    sex: "unknown",
  },
];

/**
 * The demo's MRN lookup, following core's rules in core's order: a bad MRN
 * is 422; then the limits (misses count too, 429 `rate_limited`); then an
 * exact match on the normalised MRN among the demo hospital's active
 * patients: none (or merged) is 404 `not_found`, two is 409 `conflict`.
 * It keeps only the times of past lookups, never an MRN, in memory; a
 * reload forgets them, a sign-out doesn't (like core's limits).
 */
export function createMockLookup({
  now = () => Date.now(),
  delayMs = 150,
  limits = MOCK_LOOKUP_LIMITS,
}: {
  now?: () => number;
  delayMs?: number;
  limits?: { perMinute: number; perDay: number; hospitalPerDay: number };
} = {}): LookupClient {
  // One clinician and one hospital per mock: the same counts for both.
  let times: number[] = [];
  const dayOf = (ms: number) => new Date(ms).toDateString();
  return {
    async lookupPatient(mrn) {
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (mrnProblem(mrn)) throw new ApiError(422, "validation_failed");
      const t = now();
      times = times.filter((x) => dayOf(x) === dayOf(t));
      const lastMinute = times.filter((x) => t - x < MINUTE).length;
      if (
        lastMinute >= limits.perMinute ||
        times.length >= limits.perDay ||
        times.length >= limits.hospitalPerDay
      )
        throw new ApiError(429, "rate_limited");
      times.push(t);
      const want = normaliseMrn(mrn);
      const hits: PatientFound[] = [
        ...MOCK_HOSPITAL_PATIENTS.filter(
          (p) => p.active && normaliseMrn(p.mrn) === want,
        ).map(({ id, full_name, age, sex }) => ({
          id,
          full_name,
          mrn: want,
          age,
          sex,
        })),
        ...SHARED.filter((p) => p.mrn === want),
      ];
      if (hits.length > 1) throw new ApiError(409, "conflict");
      if (!hits[0]) throw new ApiError(404, "not_found");
      return { ...hits[0] };
    },
  };
}
