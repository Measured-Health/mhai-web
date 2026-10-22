"use client";
import { useState } from "react";

type Callbacks<R> = {
  onSuccess?(data: R): void;
  onError?(error: unknown): void;
};

/**
 * Runs a write that carries the person's two-step code, and forgets it.
 * After every answer, success or refusal, the mutation is reset, so the
 * code never stays in the cache's variables. The refusal is kept here (as
 * `error`) for the dialog to show. Pass a mutation with `gcTime: 0` too, so
 * the cache lets go as soon as nothing watches it.
 */
export function useStepUpCall<V, R>(m: {
  mutate(
    v: V,
    o?: {
      onSuccess?: (data: R) => void;
      onError?: (error: Error) => void;
    },
  ): void;
  reset(): void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return {
    pending,
    error,
    /** Forgets a shown refusal, e.g. when the dialog closes. */
    clear: () => setError(null),
    call(v: V, cb: Callbacks<R> = {}) {
      setPending(true);
      setError(null);
      m.mutate(v, {
        onSuccess: (data) => {
          setPending(false);
          m.reset();
          cb.onSuccess?.(data);
        },
        onError: (e) => {
          setPending(false);
          setError(e);
          m.reset();
          cb.onError?.(e);
        },
      });
    },
  };
}
