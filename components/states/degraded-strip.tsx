"use client";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { getClient } from "@/lib/api/client";

export function DegradedStrip() {
  const { data } = useQuery({
    queryKey: ["readyz"],
    queryFn: () => getClient().getReadiness(),
    refetchInterval: 60_000,
  });
  return data && !data.ok ? (
    <div
      role="status"
      className="flex items-center gap-2.5 border-b border-warn-line bg-warn-wash px-4 py-2 text-[13px] text-warn-deep md:px-[26px]"
    >
      <AlertTriangle aria-hidden className="size-4 shrink-0" />
      Some services are running slowly right now. Results may take longer than
      usual.
    </div>
  ) : null;
}
