"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { HospitalSummary, StepUp } from "../api/contract";
import type {
  ConnectionIn,
  ConnectionPatch,
  ConnectionsQuery,
  EmrConnection,
} from "../api/emr-contract";
import { queryKeys } from "./keys";

const TEN_MINUTES = 10 * 60_000;

/** Every record-connection query hangs off this root. */
export const emrKey = ["emr"] as const;
export const typesKey = [...emrKey, "types"] as const;
export const listKey = (q: ConnectionsQuery) => [...emrKey, "list", q] as const;
export const connectionKey = (id: string) => [...emrKey, id] as const;
/** The hospital's Recent actions, which list connection changes too. */
const feedKey = (hospitalId: string) =>
  [...queryKeys.activity, "feed", hospitalId] as const;

/** The kinds of connection, as data. Rarely changes. */
export function useConnectorTypes() {
  return useQuery({
    queryKey: typesKey,
    staleTime: TEN_MINUTES,
    queryFn: async () => (await getPlatformClient().listConnectorTypes()).types,
  });
}

export function useConnections(q: ConnectionsQuery) {
  return useQuery({
    queryKey: listKey(q),
    queryFn: () => getPlatformClient().listConnections(q),
  });
}

/** One connection. Credentials are never in it, only when each was set. */
export function useConnection(id: string) {
  return useQuery({
    queryKey: connectionKey(id),
    queryFn: () => getPlatformClient().getConnection(id),
  });
}

/** Hospitals that can still have a connection, for the Add page's picker. */
export function useConnectableHospitals() {
  return useQuery({
    queryKey: [...emrKey, "hospitals"] as const,
    queryFn: async () => {
      const all: HospitalSummary[] = [];
      let cursor: string | undefined;
      do {
        const p = await getPlatformClient().listHospitals(
          cursor ? { cursor } : {},
        );
        all.push(...p.hospitals);
        cursor = p.next_cursor ?? undefined;
      } while (cursor);
      return all.filter((h) => h.status !== "removed");
    },
  });
}

/** After a change: the page shows the reply; lists and the feed refetch. */
function useSaved() {
  const qc = useQueryClient();
  return (c: EmrConnection) => {
    qc.setQueryData(connectionKey(c.id), c);
    void qc.invalidateQueries({ queryKey: emrKey });
    void qc.invalidateQueries({ queryKey: feedKey(c.hospital.id) });
  };
}

/** The mutation holds credentials: forget it as soon as it has an answer. */
function useResetOnSettle(m: {
  isSuccess: boolean;
  isError: boolean;
  reset(): void;
}) {
  const { isSuccess, isError, reset } = m;
  useEffect(() => {
    if (isSuccess || isError) reset();
  }, [isSuccess, isError, reset]);
}

/** Adds a connection to a hospital; it starts switched off. */
export function useAddConnection(hospitalId: string) {
  const saved = useSaved();
  const m = useKeyedMutation(
    (body: ConnectionIn, key) =>
      getPlatformClient().addConnection(hospitalId, body, {
        idempotencyKey: key,
      }),
    { onSuccess: saved },
    // The request holds credentials: keep them out of the cache once settled.
    { gcTime: 0 },
  );
  useResetOnSettle(m);
  return m;
}

/** Edits a connection; only credentials being replaced are sent. */
export function useUpdateConnection(id: string) {
  const saved = useSaved();
  const m = useKeyedMutation(
    (body: ConnectionPatch, key) =>
      getPlatformClient().updateConnection(id, body, { idempotencyKey: key }),
    { onSuccess: saved },
    { gcTime: 0 },
  );
  useResetOnSettle(m);
  return m;
}

/** Switches a connection on or off; the person's own code goes with it. */
export function useSetEnabled(id: string) {
  const saved = useSaved();
  return useKeyedMutation(
    (body: { enabled: boolean; version: number } & StepUp, key) =>
      getPlatformClient().setConnectionEnabled(id, body, {
        idempotencyKey: key,
      }),
    { onSuccess: saved },
    { gcTime: 0 },
  );
}

/** Tries the saved settings and records the result. No code needed. */
export function useTestConnection(id: string) {
  const saved = useSaved();
  return useKeyedMutation(
    (_: void, key) =>
      getPlatformClient().testConnection(id, { idempotencyKey: key }),
    { onSuccess: saved },
  );
}
