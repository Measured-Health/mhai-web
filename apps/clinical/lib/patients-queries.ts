"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { READ_RETRY } from "@mhai/api-client/network";
import { getPatientsClient } from "./api/patients";
import type {
  ExclusionIn,
  ExclusionOut,
  StepUpAuth,
} from "./api/patients-contract";

export const PATIENT_KEYS = {
  matches: ["patients", "matches"] as const,
};

/**
 * The possible duplicate patients. They carry names and MRNs, so the list
 * is dropped as soon as no screen shows it (`gcTime: 0`): in memory only,
 * never stored. Core audits every page it serves, so it is read when the
 * screen opens and after a decision, never on focus or reconnect.
 */
export const usePatientMatches = () =>
  useQuery({
    queryKey: PATIENT_KEYS.matches,
    queryFn: () => getPatientsClient().listMatches(),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    ...READ_RETRY,
  });

export type MatchDecision =
  | { id: string; decision: "confirm"; keep: "a" | "b"; auth: StepUpAuth }
  | { id: string; decision: "reject"; auth: StepUpAuth };

/** Merge or reject one match; the list is read again either way. */
export function useDecideMatch() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (d: MatchDecision, key) =>
      d.decision === "confirm"
        ? getPatientsClient().confirmMatch(d.id, d.keep, d.auth, {
            idempotencyKey: key,
          })
        : getPatientsClient().rejectMatch(d.id, d.auth, {
            idempotencyKey: key,
          }),
    {
      onSettled: () =>
        void qc.invalidateQueries({ queryKey: PATIENT_KEYS.matches }),
    },
    // The code is in the variables: forget them once the call is over.
    { gcTime: 0 },
  );
}

/** Exclude one patient. Its matches go too, so the list is read again. */
export function useExcludePatient() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (v: { body: ExclusionIn; auth: StepUpAuth }, key): Promise<ExclusionOut> =>
      getPatientsClient().excludePatient(v.body, v.auth, {
        idempotencyKey: key,
      }),
    {
      onSuccess: () =>
        void qc.invalidateQueries({ queryKey: PATIENT_KEYS.matches }),
    },
    { gcTime: 0 },
  );
}
