"use client";
import { useState } from "react";
import { useAuth } from "../auth/auth-context";

/** The parts of a keyed mutation a step-up call uses. */
type Write<V, R> = {
  mutate(v: V, o?: { onSuccess?(r: R): void; onError?(e: Error): void }): void;
  reset(): void;
  isPending: boolean;
};

/**
 * A write confirmed with the person's two-step or backup code. The code is
 * in the mutation's variables, so after every answer, right or wrong, the
 * mutation is reset and the cache lets the call go; the refusal is kept
 * here instead, for the StepUpDialog to show.
 */
export function useStepUpCall<V extends object, R>(m: Write<V, R>) {
  const { user, updateUser } = useAuth();
  const [error, setError] = useState<unknown>(null);
  return {
    busy: m.isPending,
    /** The last refusal shown in the dialog; null when none. */
    error,
    /** Forgets the refusal and the call (when the dialog closes). */
    clear() {
      setError(null);
      m.reset();
    },
    /**
     * Sends it. `onError` returns true when it handled the refusal itself
     * (the dialog then shows nothing).
     */
    run(
      v: V,
      on: { onSuccess?(r: R): void; onError?(e: Error): boolean | void } = {},
    ) {
      setError(null);
      m.mutate(v, {
        onSuccess: (r) => {
          m.reset();
          // A backup code works once: one fewer left.
          if ("backup_code" in v && user?.backupCodesLeft != null)
            updateUser({
              backupCodesLeft: Math.max(0, user.backupCodesLeft - 1),
            });
          on.onSuccess?.(r);
        },
        onError: (e) => {
          m.reset();
          if (!on.onError?.(e)) setError(e);
        },
      });
    },
  };
}
