"use client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type {
  Clearance,
  ClearancesClient,
  ClearanceTab,
} from "../api/clearances-contract";
import { queryKeys } from "./keys";

/** Every letter list, whatever its tab. */
export const clearanceListKey = [...queryKeys.clearances, "list"] as const;
/** One letter. */
export const clearanceKey = (id: string) =>
  [...queryKeys.clearances, "one", id] as const;

/** One tab of the queue, a page at a time (`next_cursor`). */
export function useClearances(tab: ClearanceTab) {
  return useInfiniteQuery({
    queryKey: [...clearanceListKey, tab],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getPlatformClient().listClearances({ status: tab, cursor: pageParam }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    select: (d): Clearance[] => d.pages.flatMap((p) => p.clearances),
  });
}

/** One letter, with its history. Its pages are never cached: see LetterViewer. */
export function useClearance(id: string) {
  return useQuery({
    queryKey: clearanceKey(id),
    queryFn: () => getPlatformClient().getClearance(id),
  });
}

/** The named-access switch: global and per hospital. */
export function useNamedAccessState() {
  return useQuery({
    queryKey: queryKeys.namedAccess,
    queryFn: () => getPlatformClient().getNamedAccess(),
  });
}

/**
 * After a change to a letter: its detail shows the reply; the queue, the
 * switch (people who can see names) and Activity refetch.
 */
export function clearanceSaved(qc: QueryClient, c: Clearance) {
  qc.setQueryData(clearanceKey(c.id), c);
  for (const queryKey of [
    clearanceListKey,
    queryKeys.namedAccess,
    queryKeys.activity,
  ])
    void qc.invalidateQueries({ queryKey });
}

/** Re-reads one letter, e.g. after a refusal that says it changed. */
export function useRefreshClearance() {
  const qc = useQueryClient();
  return (id: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: clearanceKey(id) }),
      qc.invalidateQueries({ queryKey: clearanceListKey }),
    ]);
}

type Client = ClearancesClient;
type VerifyBody = Parameters<Client["verifyClearance"]>[1];
type RejectBody = Parameters<Client["rejectClearance"]>[1];
type RevokeBody = Parameters<Client["revokeClearance"]>[1];
export type VerifyInput = { id: string } & VerifyBody;
export type RejectInput = { id: string } & RejectBody;
export type RevokeInput = { id: string } & RevokeBody;

/*
 * Verify, reject and revoke carry the person's two-step code in their
 * variables, so the cache forgets each call as soon as nothing watches it
 * (gcTime 0); `useStepUpCall` resets them after every answer. The code
 * stays at the top of the variables, where `useStepUpCall` looks for a
 * backup code.
 */
function useLetterWrite<V extends { id: string }>(
  send: (v: V, key: string) => Promise<Clearance>,
) {
  const qc = useQueryClient();
  return useKeyedMutation(
    send,
    { onSuccess: (c) => clearanceSaved(qc, c) },
    { gcTime: 0 },
  );
}

export function useVerify() {
  return useLetterWrite(({ id, ...body }: VerifyInput, key) =>
    getPlatformClient().verifyClearance(id, body as VerifyBody, {
      idempotencyKey: key,
    }),
  );
}

export function useReject() {
  return useLetterWrite(({ id, ...body }: RejectInput, key) =>
    getPlatformClient().rejectClearance(id, body as RejectBody, {
      idempotencyKey: key,
    }),
  );
}

export function useRevoke() {
  return useLetterWrite(({ id, ...body }: RevokeInput, key) =>
    getPlatformClient().revokeClearance(id, body as RevokeBody, {
      idempotencyKey: key,
    }),
  );
}
