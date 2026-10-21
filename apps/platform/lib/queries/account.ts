"use client";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/auth-context";
import { queryKeys } from "./keys";

/** The signed-in sessions for this account. */
export function useDevices() {
  const { client } = useAuth();
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: () => client.listDevices(),
  });
}
