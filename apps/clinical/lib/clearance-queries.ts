"use client";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { READ_RETRY, usePollEvery } from "@mhai/api-client/network";
import { ADMIN_KEYS } from "./admin-queries";
import { getClearanceClient } from "./api/clearances";
import type {
  ClearanceOut,
  ClearancesOut,
  ClearanceUpload,
  NarrowBody,
  RevokeBody,
} from "./api/clearances-contract";

/** While a letter is "Checking the file", the list reloads this often. */
export const CHECKING_POLL_MS = 5_000;

/**
 * Everything about clearance letters sits under ["clearances"], so one call
 * clears it (two-step needed; sign-out clears the whole cache). The letter
 * itself is never cached: its pages are fetched one at a time and held in
 * the viewer's state only.
 */
export const CLEARANCE_KEYS = {
  all: ["clearances"] as const,
  list: ["clearances", "list"] as const,
  one: (id: string) => ["clearances", "one", id] as const,
  named: ["clearances", "named-access"] as const,
};

/** The hospital's effective switch position (Off when the key is off). */
export const useNamedAccess = () =>
  useQuery({
    queryKey: CLEARANCE_KEYS.named,
    queryFn: () => getClearanceClient().getNamedAccess(),
    ...READ_RETRY,
  });

const checking = (d: ClearancesOut | undefined) =>
  d?.clearances.some((c) => c.status === "checking") ?? false;

/**
 * The hospital's letters, newest first, with the server's `today` and
 * `max_end_date`. Reloads every 5 s while any letter is being checked.
 */
export function useClearances({ enabled = true }: { enabled?: boolean } = {}) {
  const every = usePollEvery(CHECKING_POLL_MS);
  return useQuery({
    queryKey: CLEARANCE_KEYS.list,
    queryFn: () => getClearanceClient().listClearances(),
    enabled,
    refetchInterval: (q) => (checking(q.state.data) ? every : false),
    ...READ_RETRY,
  });
}

/** One letter; `null` loads nothing. */
export const useClearance = (id: string | null) =>
  useQuery({
    queryKey: CLEARANCE_KEYS.one(id ?? ""),
    queryFn: () => getClearanceClient().getClearance(id!),
    enabled: id !== null,
    ...READ_RETRY,
  });

/** A letter as the server now has it, in the list and on its own. */
function putLetter(qc: QueryClient, c: ClearanceOut) {
  qc.setQueryData(CLEARANCE_KEYS.one(c.id), c);
  qc.setQueryData<ClearancesOut>(CLEARANCE_KEYS.list, (d) =>
    d
      ? {
          ...d,
          clearances: d.clearances.some((x) => x.id === c.id)
            ? d.clearances.map((x) => (x.id === c.id ? c : x))
            : [c, ...d.clearances],
        }
      : d,
  );
}

/** After any letter write: the letters (others may have changed them) and the log. */
function refresh(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: CLEARANCE_KEYS.all });
  void qc.invalidateQueries({ queryKey: ADMIN_KEYS.activityAll });
}

/**
 * Each write carries the admin's two-step code (and the upload, the file)
 * in its variables, so the cache forgets the call as soon as nobody is
 * watching it (`gcTime: 0`).
 */
function useLetterWrite<V>(send: (v: V, key: string) => Promise<ClearanceOut>) {
  const qc = useQueryClient();
  return useKeyedMutation(
    send,
    {
      onSuccess: (c) => putLetter(qc, c),
      onSettled: () => refresh(qc),
    },
    { gcTime: 0 },
  );
}

export const useUploadClearance = () =>
  useLetterWrite((u: ClearanceUpload, key) =>
    getClearanceClient().uploadClearance(u, { idempotencyKey: key }),
  );

export const useRevokeClearance = () =>
  useLetterWrite((v: { id: string; body: RevokeBody }, key) =>
    getClearanceClient().revokeClearance(v.id, v.body, {
      idempotencyKey: key,
    }),
  );

export const useNarrowClearance = () =>
  useLetterWrite((v: { id: string; body: NarrowBody }, key) =>
    getClearanceClient().narrowClearance(v.id, v.body, {
      idempotencyKey: key,
    }),
  );
