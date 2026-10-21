"use client";
import { useQuery } from "@tanstack/react-query";
import { getPlatformClient } from "@/lib/api/client";
import { queryKeys } from "@/lib/queries/keys";
import { TopBar } from "../shell/top-bar";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { StatusChip } from "./status-chip";

/** Stands in for the hospital page until Task 10 builds it. */
export function HospitalPlaceholder({ id }: { id: string }) {
  const q = useQuery({
    queryKey: [...queryKeys.hospitals, "one", id],
    queryFn: () => getPlatformClient().getHospital(id),
  });
  return (
    <>
      <TopBar title={q.data?.name ?? "Hospital"} />
      <div className="flex-1 overflow-auto px-4 pt-6 md:px-[26px]">
        {q.isError ? (
          <CouldntLoad what="this hospital" onRetry={() => void q.refetch()} />
        ) : q.data ? (
          <StatusChip status={q.data.status} />
        ) : (
          <Loading />
        )}
      </div>
    </>
  );
}
