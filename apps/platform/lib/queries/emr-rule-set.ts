"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { EmrRuleSet, EmrRuleSetIn } from "../api/emr-rule-set-contract";
import { queryKeys } from "./keys";

export const emrRuleSetKey = (id: string) =>
  [...queryKeys.hospitals, id, "emr-rule-set"] as const;

/** One hospital's EMR rule set, or shadow. */
export function useEmrRuleSet(id: string) {
  return useQuery({
    queryKey: emrRuleSetKey(id),
    queryFn: () => getPlatformClient().getEmrRuleSet(id),
  });
}

/**
 * Switches it, with the person's two-step code in the variables: the cache
 * forgets each call as soon as nothing watches it (gcTime 0), and
 * useStepUpCall resets it after every answer.
 */
export function useSetEmrRuleSet(id: string) {
  const qc = useQueryClient();
  return useKeyedMutation(
    (body: EmrRuleSetIn, key) =>
      getPlatformClient().setEmrRuleSet(id, body, { idempotencyKey: key }),
    {
      onSuccess: (r: EmrRuleSet) => {
        qc.setQueryData(emrRuleSetKey(id), r);
        void qc.invalidateQueries({ queryKey: queryKeys.activity });
      },
    },
    { gcTime: 0 },
  );
}
