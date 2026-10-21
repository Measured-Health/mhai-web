"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { SsoIn, SsoOut } from "../api/contract";
import { queryKeys } from "./keys";

const ssoKey = (id: string) => [...queryKeys.hospitals, id, "sso"] as const;

/** One hospital's single sign-on set-up. The secret is never in it. */
export function useSso(id: string) {
  return useQuery({
    queryKey: ssoKey(id),
    queryFn: () => getPlatformClient().getSso(id),
  });
}

/** Saves the set-up; `client_secret` goes only when the user typed one. */
export function useSaveSso(id: string) {
  const qc = useQueryClient();
  const m = useKeyedMutation(
    (body: SsoIn, key) =>
      getPlatformClient().saveSso(id, body, { idempotencyKey: key }),
    {
      onSuccess: (sso: SsoOut) => {
        qc.setQueryData(ssoKey(id), sso);
        void qc.invalidateQueries({ queryKey: queryKeys.hospitals });
      },
    },
    // The request holds the secret: keep it out of the cache once settled.
    { gcTime: 0 },
  );
  const { isSuccess, isError, reset } = m;
  useEffect(() => {
    if (isSuccess || isError) reset();
  }, [isSuccess, isError, reset]);
  return m;
}

/** Tries the saved set-up and records the result. */
export function useTestSso(id: string) {
  const qc = useQueryClient();
  return useKeyedMutation(
    (_: void, key) => getPlatformClient().testSso(id, { idempotencyKey: key }),
    { onSuccess: (sso: SsoOut) => qc.setQueryData(ssoKey(id), sso) },
  );
}
