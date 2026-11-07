"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { ModelPolicy, ModelPolicyIn } from "../api/model-policy-contract";
import { queryKeys } from "./keys";

export const modelPolicyKey = (id: string) =>
  [...queryKeys.hospitals, id, "model-policy"] as const;

/** One hospital's AI model and this month's use. */
export function useModelPolicy(id: string) {
  return useQuery({
    queryKey: modelPolicyKey(id),
    queryFn: () => getPlatformClient().getModelPolicy(id),
  });
}

/**
 * Sets it, with the person's two-step code in the variables: the cache
 * forgets each call as soon as nothing watches it (gcTime 0), and
 * useStepUpCall resets it after every answer.
 */
export function useSetModelPolicy(id: string) {
  const qc = useQueryClient();
  return useKeyedMutation(
    (body: ModelPolicyIn, key) =>
      getPlatformClient().setModelPolicy(id, body, { idempotencyKey: key }),
    {
      onSuccess: (p: ModelPolicy) => {
        qc.setQueryData(modelPolicyKey(id), p);
        // Recent actions and Activity list the change.
        void qc.invalidateQueries({ queryKey: queryKeys.activity });
      },
    },
    { gcTime: 0 },
  );
}
