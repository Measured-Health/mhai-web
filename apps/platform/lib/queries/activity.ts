"use client";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getPlatformClient } from "@/lib/api/client";
import type { HospitalSummary } from "@/lib/api/contract";
import { queryKeys } from "./keys";

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
    staleTime: 0,
    refetchOnMount: "always",
  });
}

/** Every hospital, for the Activity filter's options. */
export function useHospitalOptions() {
  return useQuery({
    queryKey: [...queryKeys.activity, "hospital-options"] as const,
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
