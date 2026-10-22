"use client";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { getPlatformClient } from "../api/client";
import type { StepUp } from "../api/contract";
import type { RetentionType, SettingsOut } from "../api/settings-contract";
import { queryKeys } from "./keys";

/** How often the settings look again while the learning-data reset runs. */
export const RESET_POLL_MS = 5_000;

export const settingsKey = [...queryKeys.settings, "all"] as const;
export const previewKey = (type: RetentionType, days: number) =>
  [...queryKeys.settings, "preview", type, days] as const;

/** Every platform setting; refetches every 5 s while the reset runs. */
export function useSettings() {
  return useQuery({
    queryKey: settingsKey,
    queryFn: () => getPlatformClient().getSettings(),
    refetchInterval: (q) =>
      q.state.data?.feedback_buffer?.running ? RESET_POLL_MS : false,
  });
}

/** Re-reads the settings, e.g. after a refusal that says they changed. */
export function useRefreshSettings() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: settingsKey });
}

const readPreview = (type: RetentionType, days: number) => () =>
  getPlatformClient().previewRetention(type, days);

/**
 * How many records a shorter period would delete at the next clean-up.
 * Always read afresh when asked for: the count changes every day.
 */
export function useRetentionPreview(
  type: RetentionType,
  days: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: previewKey(type, days),
    queryFn: readPreview(type, days),
    enabled,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
  });
}

/** The same count, read now (never from the cache), for an approval. */
export function useFetchPreview() {
  const qc = useQueryClient();
  return (type: RetentionType, days: number) =>
    qc.fetchQuery({
      queryKey: previewKey(type, days),
      queryFn: readPreview(type, days),
      staleTime: 0,
      gcTime: 0,
    });
}

/** Every write answers with the whole settings: show it; Activity refetches. */
function settingsSaved(qc: QueryClient, s: SettingsOut) {
  qc.setQueryData(settingsKey, s);
  void qc.invalidateQueries({ queryKey: queryKeys.activity });
}

/** A settings write whose reply is the whole `SettingsOut`. */
function useSettingsWrite<V>(
  send: (v: V, key: string) => Promise<SettingsOut>,
  extra: { gcTime?: number } = {},
) {
  const qc = useQueryClient();
  return useKeyedMutation(
    send,
    { onSuccess: (s) => settingsSaved(qc, s) },
    extra,
  );
}

export type SetRetentionInput = {
  type: RetentionType;
  days: number;
  reason: string;
  version: number;
} & StepUp;
export type SetTriageInput = {
  enabled: boolean;
  reason: string;
  clinical_signoff?: string;
  version: number;
} & StepUp;

/*
 * The writes below carry the person's two-step code in their variables, so
 * the cache forgets each call as soon as nothing watches it (gcTime 0).
 * Callers `reset()` after every answer (useStepUpCall does), which lets it
 * go at once.
 */

/** Longer applies at once; shorter makes a request for a second admin. */
export function useSetRetention() {
  return useSettingsWrite(
    ({ type, ...body }: SetRetentionInput, key) =>
      getPlatformClient().setRetention(type, body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

export function useSetCleanUpPaused() {
  return useSettingsWrite(
    (body: { paused: boolean; reason: string } & StepUp, key) =>
      getPlatformClient().setCleanUpPaused(body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

/** Off applies at once; on makes a request for a second admin. */
export function useSetTriage() {
  return useSettingsWrite(
    (body: SetTriageInput, key) =>
      getPlatformClient().setTriage(body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

/** A different platform admin approves, with the version they saw. */
export function useApproveSettingsRequest() {
  return useSettingsWrite(
    ({ id, ...body }: { id: string; version: number } & StepUp, key) =>
      getPlatformClient().approveRequest(id, body, { idempotencyKey: key }),
    { gcTime: 0 },
  );
}

/** Either platform admin; no step-up. */
export function useCancelSettingsRequest() {
  return useSettingsWrite(
    ({ id, ...body }: { id: string; version: number }, key) =>
      getPlatformClient().cancelRequest(id, body, { idempotencyKey: key }),
  );
}

/**
 * Starts clearing the learning data. Its reply is the job, not the
 * settings, so they are read again (and then polled while it runs).
 */
export function useResetFeedbackBuffer() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (body: { reason: string } & StepUp, key) =>
      getPlatformClient().resetFeedbackBuffer(body, { idempotencyKey: key }),
    {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: settingsKey });
        void qc.invalidateQueries({ queryKey: queryKeys.activity });
      },
    },
    { gcTime: 0 },
  );
}
