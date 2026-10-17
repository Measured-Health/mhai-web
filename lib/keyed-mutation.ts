"use client";
import {
  useMutation,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";
import { retryDelay, shouldRetry } from "./network";

/** Writes retry network errors and 5xx with the same key, never offline, never a 4xx. */
export const WRITE_RETRY = {
  networkMode: "always" as const,
  retry: (n: number, e: unknown) => navigator.onLine && shouldRetry(n, e, 2),
  retryDelay,
};

type Keyed<V> = { v: V; key: string };

/**
 * A write with one Idempotency-Key per call to `mutate`, reused on that call's
 * retries. `send` receives the key; the callbacks see the plain variables.
 */
export function useKeyedMutation<V, R>(
  send: (v: V, key: string) => Promise<R>,
  cb: {
    onSuccess?(data: R, v: V): void;
    onError?(e: Error, v: V): void;
    onSettled?(): void;
  } = {},
): Omit<UseMutationResult<R, Error, Keyed<V>>, "mutate"> & {
  mutate: (
    v: V,
    options?: Parameters<UseMutationResult<R, Error, Keyed<V>>["mutate"]>[1],
  ) => void;
} {
  const opts: UseMutationOptions<R, Error, Keyed<V>> = {
    mutationFn: ({ v, key }) => send(v, key),
    ...WRITE_RETRY,
    onSuccess: (d, { v }) => cb.onSuccess?.(d, v),
    onError: (e, { v }) => cb.onError?.(e, v),
    onSettled: () => cb.onSettled?.(),
  };
  const m = useMutation(opts);
  return {
    ...m,
    mutate: (v, options) => m.mutate({ v, key: crypto.randomUUID() }, options),
  };
}
