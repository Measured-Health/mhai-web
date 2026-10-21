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
export function useKeyedMutation<V, R, C = unknown>(
  send: (v: V, key: string) => Promise<R>,
  cb: {
    /** Runs first; what it returns reaches `onError` as `ctx` (for a rollback). */
    onMutate?(v: V): C | Promise<C>;
    onSuccess?(data: R, v: V): void;
    onError?(e: Error, v: V, ctx: C | undefined): void;
    onSettled?(): void;
  } = {},
  extra: Pick<
    UseMutationOptions<R, Error, Keyed<V>, C>,
    "gcTime" | "mutationKey"
  > = {},
): Omit<UseMutationResult<R, Error, Keyed<V>, C>, "mutate" | "mutateAsync"> & {
  mutate: (
    v: V,
    options?: Parameters<UseMutationResult<R, Error, Keyed<V>, C>["mutate"]>[1],
  ) => void;
  mutateAsync: (
    v: V,
    options?: Parameters<
      UseMutationResult<R, Error, Keyed<V>, C>["mutateAsync"]
    >[1],
  ) => Promise<R>;
} {
  const opts: UseMutationOptions<R, Error, Keyed<V>, C> = {
    mutationFn: ({ v, key }) => send(v, key),
    ...WRITE_RETRY,
    ...extra,
    onMutate: ({ v }) => cb.onMutate?.(v) as C | Promise<C>,
    onSuccess: (d, { v }) => cb.onSuccess?.(d, v),
    onError: (e, { v }, ctx) => cb.onError?.(e, v, ctx),
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
