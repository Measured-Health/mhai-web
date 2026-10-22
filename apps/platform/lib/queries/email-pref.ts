"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { EmailPref } from "../api/notifications-contract";

/** The signed-in platform admin's analytics email setting. */
export const emailPrefKey = ["email-pref"] as const;

/** The setting and its version; platform admins only (auditors get a 403). */
export function useEmailPref(enabled = true) {
  return useQuery({
    queryKey: emailPrefKey,
    queryFn: () => getPlatformClient().getEmailPref(),
    enabled,
  });
}

/** Saves the setting with the version the person saw: one key per save. */
export function useSetEmailPref() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (body: EmailPref, key) =>
      getPlatformClient().setEmailPref(body, { idempotencyKey: key }),
    { onSuccess: (next) => qc.setQueryData(emailPrefKey, next) },
  );
}
