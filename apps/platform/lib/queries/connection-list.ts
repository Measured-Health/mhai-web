"use client";
import { useQuery } from "@tanstack/react-query";
import { getPlatformClient } from "../api/client";

/** The connection list, all of it or one hospital's. */
export const connectionListKey = (hospital?: string) =>
  ["emr", "connections", "list", hospital ?? null] as const;

/** Every connection (and the hospitals with none), or one hospital's. */
export function useConnectionList(hospital?: string) {
  return useQuery({
    queryKey: connectionListKey(hospital),
    queryFn: () =>
      getPlatformClient().listConnections({ hospital, state: "all" }),
  });
}
