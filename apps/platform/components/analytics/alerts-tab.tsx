"use client";
import type { AnalyticsState } from "@/lib/analytics/read";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";

export const ALERTS_OFF =
  "Alert safety isn't switched on yet. It starts when patient alerts do.";

/**
 * Alert safety: not switched on until patient alerts exist (core sends
 * `alerts: null`, F4). Anything else can't be read, so it fails closed.
 */
export function AlertsTab({
  state,
  failed,
  onRetry,
}: {
  state: AnalyticsState["alerts"] | null;
  failed: boolean;
  onRetry(): void;
}) {
  if (failed || state?.status === "failed")
    return <CouldntLoad what="alert safety" onRetry={onRetry} />;
  if (!state) return <Loading label="Loading alerts" />;
  return <p className="text-[14px] text-ink-2">{ALERTS_OFF}</p>;
}
