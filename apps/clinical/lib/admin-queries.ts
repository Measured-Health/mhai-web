"use client";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getAdminClient, type StaffAction } from "./api/admin";
import type {
  ActivityEventOut,
  ActivityQuery,
  SettingsPatchIn,
  StaffOut,
  StaffPatchIn,
  StepUpAuth,
  UsagePeriod,
} from "./api/admin-contract";
import { ApiError } from "./api/errors";
import { useKeyedMutation } from "@mhai/api-client/keyed-mutation";
import { READ_RETRY, usePollEvery } from "@mhai/api-client/network";

/** Review oversight refresh, like the clinicians' queue. */
export const OVERSIGHT_POLL_MS = 60_000;

export type ActivityFilter = Omit<
  ActivityQuery,
  "cursor" | "limit" | "staff_id"
>;

export const ADMIN_KEYS = {
  all: ["admin"] as const,
  staff: ["admin", "staff"] as const,
  activityAll: ["admin", "activity"] as const,
  activity: (f: ActivityFilter) => ["admin", "activity", "log", f] as const,
  staffActivity: (id: string) => ["admin", "activity", "staff", id] as const,
  settings: ["admin", "settings"] as const,
  usage: (p: UsagePeriod) => ["admin", "usage", p] as const,
  oversight: ["admin", "oversight"] as const,
  reviewers: (id: string) => ["admin", "reviewers", id] as const,
};

const statusOf = (e: unknown) => (e instanceof ApiError ? e.status : 0);

/**
 * The admin has no two-step set up (403 mfa_required). Every admin query and
 * mutation surfaces it as its `error`; none retries it. The admin screens send
 * the person to the two-step setup step when they see it.
 */
export const isMfaRequired = (e: unknown) =>
  e instanceof ApiError && e.status === 403 && e.code === "mfa_required";

/** `enabled: false` loads nothing (the sidebar on a clinical page). */
export const useStaff = ({ enabled = true }: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: ADMIN_KEYS.staff,
    queryFn: () => getAdminClient().listStaff(),
    enabled,
    ...READ_RETRY,
  });

export const useHospitalSettings = () =>
  useQuery({
    queryKey: ADMIN_KEYS.settings,
    queryFn: () => getAdminClient().getSettings(),
    staleTime: 60_000,
    ...READ_RETRY,
  });

export const useUsage = (period: UsagePeriod) =>
  useQuery({
    queryKey: ADMIN_KEYS.usage(period),
    queryFn: () => getAdminClient().getUsage(period),
    ...READ_RETRY,
  });

export function useActivity(f: ActivityFilter) {
  return useInfiniteQuery({
    queryKey: ADMIN_KEYS.activity(f),
    queryFn: ({ pageParam }) =>
      getAdminClient().listActivity({
        ...f,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    ...READ_RETRY,
  });
}

/** The staff panel's "Recent activity": the last five events about them. */
export function useStaffActivity(id: string | null) {
  return useQuery({
    queryKey: ADMIN_KEYS.staffActivity(id ?? ""),
    queryFn: async () =>
      (await getAdminClient().listActivity({ staff_id: id!, limit: 5 })).events,
    enabled: id !== null,
    ...READ_RETRY,
  });
}

export function useOversight() {
  const every = usePollEvery(OVERSIGHT_POLL_MS);
  return useQuery({
    queryKey: ADMIN_KEYS.oversight,
    queryFn: () => getAdminClient().getOversight(),
    refetchInterval: every,
    ...READ_RETRY,
  });
}

export function useEligibleReviewers(correctionId: string | null) {
  return useQuery({
    queryKey: ADMIN_KEYS.reviewers(correctionId ?? ""),
    queryFn: () => getAdminClient().listEligibleReviewers(correctionId!),
    enabled: correctionId !== null,
    ...READ_RETRY,
  });
}

/** Every page of the log for these filters, up to `max` events (R10). */
export async function fetchAllActivity(
  f: ActivityFilter,
  max: number,
): Promise<{ events: ActivityEventOut[]; capped: boolean }> {
  const events: ActivityEventOut[] = [];
  let cursor: string | null = null;
  do {
    const page = await getAdminClient().listActivity({
      ...f,
      ...(cursor ? { cursor } : {}),
    });
    events.push(...page.events);
    cursor = page.next_cursor;
  } while (cursor && events.length < max);
  return {
    events: events.slice(0, max),
    capped: cursor !== null || events.length > max,
  };
}

export function putStaff(qc: QueryClient, row: StaffOut) {
  qc.setQueryData<StaffOut[]>(ADMIN_KEYS.staff, (l) =>
    l?.map((s) => (s.id === row.id ? row : s)),
  );
}

export function dropStaff(qc: QueryClient, id: string) {
  qc.setQueryData<StaffOut[]>(ADMIN_KEYS.staff, (l) =>
    l?.filter((s) => s.id !== id),
  );
}

/** After any staff write: the list (others may have changed it too), the log, oversight. */
export async function refreshStaff(qc: QueryClient) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: ADMIN_KEYS.staff }),
    qc.invalidateQueries({ queryKey: ADMIN_KEYS.activityAll }),
    qc.invalidateQueries({ queryKey: ADMIN_KEYS.oversight }),
  ]);
}

/** Gone: drop it now. Stale (409): the refresh loads the latest (R7). */
function staffRowCallbacks(qc: QueryClient) {
  return {
    onError: (e: Error, v: { id: string }) => {
      if (statusOf(e) === 404) dropStaff(qc, v.id);
    },
    onSettled: () => void refreshStaff(qc),
  };
}

/**
 * Every staff write carries the admin's step-up code (core 1.24.0). A wrong
 * or missing code (mfa_invalid, mfa_required, mfa_locked) is a 4xx: not
 * retried, and the row stays. The code is in the variables, so the cache
 * forgets the call as soon as nobody is watching it (`gcTime: 0`), and the
 * screens `reset()` it after every answer.
 */
export function useUpdateStaff() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (v: { id: string; p: StaffPatchIn; auth: StepUpAuth }, key) =>
      getAdminClient().updateStaff(v.id, v.p, v.auth, { idempotencyKey: key }),
    { ...staffRowCallbacks(qc), onSuccess: (row) => putStaff(qc, row) },
    { gcTime: 0 },
  );
}

/** Deactivate or reactivate, with the step-up code (as `useUpdateStaff`). */
export function useStaffAction() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (v: { id: string; action: StaffAction; auth: StepUpAuth }, key) =>
      getAdminClient().staffAction(v.id, v.action, v.auth, {
        idempotencyKey: key,
      }),
    { ...staffRowCallbacks(qc), onSuccess: (row) => putStaff(qc, row) },
    { gcTime: 0 },
  );
}

/**
 * The code only goes with an edit that loosens sign-in; the cache forgets
 * the call at once (`gcTime: 0`).
 */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useKeyedMutation(
    (v: { p: SettingsPatchIn; auth: StepUpAuth | null }, key) =>
      getAdminClient().updateSettings(v.p, v.auth, { idempotencyKey: key }),
    {
      onSuccess: (s) => qc.setQueryData(ADMIN_KEYS.settings, s),
      onError: (e) => {
        if (statusOf(e) === 409)
          void qc.invalidateQueries({ queryKey: ADMIN_KEYS.settings });
      },
      onSettled: () => {
        void qc.invalidateQueries({ queryKey: ADMIN_KEYS.activityAll });
        void qc.invalidateQueries({ queryKey: ADMIN_KEYS.oversight });
      },
    },
    { gcTime: 0 },
  );
}
