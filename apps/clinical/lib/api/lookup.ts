import type { PatientFound } from "./lookup-schema";
import { createLiveLookup } from "./live-lookup";
import { createMockLookup } from "./mock-lookup";

/** A clinician's patient lookup by MRN (core 1.29.0). One hospital's patients. */
export interface LookupClient {
  /**
   * The one active patient of the caller's hospital with exactly this MRN.
   * 404 `not_found` for none (or excluded, merged, another hospital's, or
   * EMR off), 409 `conflict` for two, 429 `rate_limited` past the limits.
   */
  lookupPatient(mrn: string): Promise<PatientFound>;
}

// Kept across sign-out: it holds no patient data (the demo's keeps only the
// times of past lookups), and the demo's limits mustn't reset on sign-in.
let client: LookupClient | undefined;

/** Sample patients when NEXT_PUBLIC_USE_MOCK=true; otherwise the live API via the BFF. */
export function getLookupClient(): LookupClient {
  return (client ??=
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
      ? createMockLookup()
      : createLiveLookup());
}
