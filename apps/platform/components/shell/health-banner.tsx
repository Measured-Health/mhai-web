"use client";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readHealth } from "@/lib/ops/health";
import { useNow } from "@/lib/ops/use-now";
import { useHealth } from "@/lib/queries/ops";

export const HEALTH_PATH = "/system/health";

function Watch() {
  const q = useHealth();
  const updatedAt = (q.data as { updated_at?: unknown } | undefined)
    ?.updated_at;
  const tick = useNow(typeof updatedAt === "string" ? updatedAt : undefined);
  if (q.isPending) return null;
  // The same stale rule as the Health tab: old figures never show.
  const now = Math.max(tick, q.dataUpdatedAt);
  const state = readHealth(q.data, { failed: q.isError, now });
  if (state.overall !== "problem") return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-2 border-b border-warn-line bg-warn-wash px-4 py-2 text-[13.5px] text-warn-deep"
    >
      <AlertTriangle aria-hidden className="size-4 shrink-0" />
      <span>The service is having problems</span>
      <span aria-hidden>·</span>
      <Link
        href={HEALTH_PATH}
        className="inline-flex min-h-11 items-center font-semibold underline focus-visible:outline-2 focus-visible:outline-warn-deep"
      >
        View health
      </Link>
    </div>
  );
}

/**
 * A warn banner while the service has problems. It reads the same health
 * query as the Health tab and never shows on Couldn't check. On the Health
 * page it renders nothing and does not poll (the page does).
 */
export function HealthBanner() {
  const path = usePathname();
  if (path === HEALTH_PATH) return null;
  return <Watch />;
}
