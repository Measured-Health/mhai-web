"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Replaces the current route with `target` (when non-null). */
export function useRedirect(target: string | null) {
  const router = useRouter();
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
}
