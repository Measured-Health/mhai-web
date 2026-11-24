"use client";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { useAuth } from "@/lib/auth/auth-context";
import type { StepUpCode } from "@/lib/auth/types";

/**
 * Starts moving two-step to a new authenticator app. The step-up code is
 * in the call and the new key in its answer, so the cache forgets the call
 * as soon as nobody watches it (`gcTime: 0`) and it is reset after every
 * answer (`useStepUpCall`).
 */
export const useStartMfaReplace = () => {
  const { client } = useAuth();
  return useKeyedMutation(
    (code: StepUpCode, key: string) => client.startMfaReplace(code, key),
    {},
    { gcTime: 0 },
  );
};

/** Finishes the move with a code from the new app (forgotten the same way). */
export const useConfirmMfaReplace = () => {
  const { client } = useAuth();
  return useKeyedMutation(
    (code: string, key: string) => client.confirmMfaReplace(code, key),
    {},
    { gcTime: 0 },
  );
};
