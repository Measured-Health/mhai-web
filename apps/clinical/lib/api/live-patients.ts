import type { PatientsClient, StepUpAuth } from "./patients-contract";
import {
  EXCLUSION_SCHEMA,
  PATIENT_MATCHES_SCHEMA,
  readStrict,
} from "./patients-schema";
import { apiOk, keyHeader } from "./request";

/** The admin's own two-step code, as core takes it. */
export const codeBody = (a: StepUpAuth) =>
  "mfaCode" in a ? { mfa_code: a.mfaCode } : { backup_code: a.backupCode };

/**
 * Patient matches and exclusions through this app's /api/v1 proxy (the
 * token stays server-side). Replies read strictly; a refusal keeps only its
 * code.
 */
export function createLivePatients({
  fetchImpl = (...a: Parameters<typeof fetch>) => fetch(...a),
}: { fetchImpl?: typeof fetch } = {}): PatientsClient {
  const id = encodeURIComponent;
  const post = (path: string, body: unknown, key: string) =>
    apiOk<unknown>(fetchImpl, `/hospital${path}`, {
      method: "POST",
      body,
      headers: keyHeader({ idempotencyKey: key }),
    });
  return {
    listMatches: async () =>
      readStrict(
        PATIENT_MATCHES_SCHEMA,
        await apiOk<unknown>(fetchImpl, "/hospital/patient-matches"),
      ),
    async confirmMatch(m, keep, auth, o) {
      await post(
        `/patient-matches/${id(m)}/confirm`,
        { keep, ...codeBody(auth) },
        o.idempotencyKey,
      );
    },
    async rejectMatch(m, auth, o) {
      await post(
        `/patient-matches/${id(m)}/reject`,
        codeBody(auth),
        o.idempotencyKey,
      );
    },
    excludePatient: async (b, auth, o) =>
      readStrict(
        EXCLUSION_SCHEMA,
        await post(
          "/patient-exclusions",
          { ...b, ...codeBody(auth) },
          o.idempotencyKey,
        ),
      ),
  };
}
