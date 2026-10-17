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
 * A write with one Idempotency-Key per call to `mutate` (or `mutateAsync`),
 * reused on that call's retries. `send` receives the key; the callbacks see
 * the plain variables. `extra` passes cache options such as `gcTime`.
 */
export function useKeyedMutation<V, R>(
  send: (v: V, key: string) => Promise<R>,
  cb: {
    onSuccess?(data: R, v: V): void;
    onError?(e: Error, v: V): void;
    onSettled?(): void;
  } = {},
  extra: Pick<UseMutationOptions<R, Error, Keyed<V>>, "gcTime"> = {},
): Omit<UseMutationResult<R, Error, Keyed<V>>, "mutate" | "mutateAsync"> & {
  mutate: (
    v: V,
    options?: Parameters<UseMutationResult<R, Error, Keyed<V>>["mutate"]>[1],
  ) => void;
  mutateAsync: (
    v: V,
    options?: Parameters<
      UseMutationResult<R, Error, Keyed<V>>["mutateAsync"]
    >[1],
  ) => Promise<R>;
} {
  const opts: UseMutationOptions<R, Error, Keyed<V>> = {
    mutationFn: ({ v, key }) => send(v, key),
    ...WRITE_RETRY,
    ...extra,
    onSuccess: (d, { v }) => cb.onSuccess?.(d, v),
    onError: (e, { v }) => cb.onError?.(e, v),
    onSettled: () => cb.onSettled?.(),
  };
  const m = useMutation(opts);
  return {
    ...m,
    mutate: (v, options) => m.mutate({ v, key: crypto.randomUUID() }, options),
    mutateAsync: (v, options) =>
      m.mutateAsync({ v, key: crypto.randomUUID() }, options),
  };
}
