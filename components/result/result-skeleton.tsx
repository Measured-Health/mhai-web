"use client";
import { useEffect, useState } from "react";
import { Skeleton } from "../ui/skeleton";

/** Shown only if loading takes longer than 200 ms (spec §3 Motion). */
export function ResultSkeleton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading result"
      className="card-v3 mx-auto max-w-[700px] p-6"
    >
      <div className="flex justify-between">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-8 w-40 rounded-full" />
      </div>
      <Skeleton className="mb-3.5 mt-4 h-10 w-3/5" />
      <Skeleton className="my-2 h-3.5" />
      <Skeleton className="my-2 h-3.5 w-11/12" />
      <Skeleton className="my-2 h-3.5 w-3/4" />
    </div>
  );
}
