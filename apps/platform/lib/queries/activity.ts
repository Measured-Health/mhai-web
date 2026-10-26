"use client";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import type { AccessQuery } from "@/lib/api/analysis-contract";
import { getPlatformClient } from "@/lib/api/client";
import type { HospitalSummary } from "@/lib/api/contract";
import { readAccessPage, type AccessPage } from "@/lib/analysis/access";
import { downloadBlob } from "@mhai/ui/csv";
import { queryKeys } from "./keys";
import { SessionEnded, sessionEpoch } from "./session-end";

/**
 * Events newest first, a page at a time (follow `next_cursor`). Refetched
 * whenever a screen mounts, so what was just done in the app is on top.
 */
export function useActivityFeed({ hospital }: { hospital?: string } = {}) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.activity, "feed", hospital ?? null] as const,
    queryFn: ({ pageParam }) =>
      getPlatformClient().listActivity({
        ...(hospital ? { hospital } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    refetchOnMount: "always",
  });
}

/** Every hospital, for the Activity filter's options. */
export function useHospitalOptions() {
  return useQuery({
    queryKey: [...queryKeys.activity, "hospital-options"] as const,
    refetchOnMount: "always",
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
      return all.map((h) => ({ id: h.id, name: h.name }));
    },
  });
}

type AccessRaw = { entries: unknown[]; next_cursor: string | null };
type ReadAccess = ReturnType<typeof readAccessPage>;

/**
 * Who used Analysis, newest first, a page at a time. Each page is read
 * strictly: a bad page is "failed" and shows nothing of itself. Nothing but
 * the hospital and the kind (both ids/words, no patient data) is in the key.
 */
export function useAnalysisAccess(q: Omit<AccessQuery, "cursor"> = {}) {
  return useInfiniteQuery({
    queryKey: [
      ...queryKeys.activity,
      "analysis-access",
      q.hospital ?? null,
      q.kind ?? null,
    ] as const,
    queryFn: ({ pageParam }) =>
      getPlatformClient().listAnalysisAccess({
        ...(q.hospital ? { hospital: q.hospital } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }) as Promise<AccessRaw>,
    initialPageParam: null as string | null,
    getNextPageParam: (last: AccessRaw) => last.next_cursor,
    select: (
      d: InfiniteData<AccessRaw, string | null>,
    ): InfiniteData<ReadAccess, string | null> => ({
      pages: d.pages.map(readAccessPage),
      pageParams: d.pageParams,
    }),
    refetchOnMount: "always",
  });
}
export type { AccessPage };

/**
 * The trail as a file for a legal request: made by the server, saved here
 * from a Blob URL. The file is not kept, and not handed to the next person
 * if the session ended meanwhile.
 */
export function useExportAnalysisAccess() {
  return useMutation({
    mutationFn: async (q: Omit<AccessQuery, "cursor">) => {
      const epoch = sessionEpoch();
      const { filename, blob } = await getPlatformClient().exportAnalysisAccess(
        {
          ...(q.hospital ? { hospital: q.hospital } : {}),
          ...(q.kind ? { kind: q.kind } : {}),
        },
      );
      if (sessionEpoch() !== epoch) throw new SessionEnded();
      downloadBlob(filename, blob);
    },
    retry: false,
    gcTime: 0,
  });
}
