"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { READ_RETRY } from "@mhai/api-client/network";
import { ADMIN_KEYS } from "./admin-queries";
import { getEmrClient } from "./api/emr";
import type {
  AlertSettingsOut,
  AlertSettingsPatchIn,
} from "./api/emr-contract";
import { ApiError } from "./api/errors";

export const EMR_KEYS = {
  settings: ["emr", "alert-settings"] as const,
};

/** The hospital's alert settings: records status, units, categories, recipients. */
export const useAlertSettings = () =>
  useQuery({
    queryKey: EMR_KEYS.settings,
    queryFn: () => getEmrClient().getAlertSettings(),
    staleTime: 60_000,
    ...READ_RETRY,
  });

/**
 * One section per save, with the version it was read at. Success replaces the
 * cached settings (the reply is the new version); a stale version (409)
 * refreshes them, so Reload has the latest underneath.
 */
export function useUpdateAlertSettings() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (p: AlertSettingsPatchIn, key) =>
      getEmrClient().updateAlertSettings(p, { idempotencyKey: key }),
    {
      onSuccess: (s: AlertSettingsOut) => qc.setQueryData(EMR_KEYS.settings, s),
      onError: (e) => {
        if (e instanceof ApiError && e.status === 409)
          void qc.invalidateQueries({ queryKey: EMR_KEYS.settings });
      },
      onSettled: () =>
        void qc.invalidateQueries({ queryKey: ADMIN_KEYS.activityAll }),
    },
  );
}
