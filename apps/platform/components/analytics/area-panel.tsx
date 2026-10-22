"use client";
import type { ReactNode } from "react";
import { failedText, type AreaKey, type AreaState } from "@/lib/analytics/read";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { updatedLine } from "./updated-line";

/**
 * One area's body: its own "Updated {time}", its own "Couldn't load {area}"
 * with Try again, and a loading line before the first reply. An area that
 * fails never shows zeros and never takes the others down.
 */
export function AreaPanel<T extends { updated_at: string }>({
  area,
  state,
  failed,
  onRetry,
  children,
}: {
  area: Exclude<AreaKey, "changes">;
  /** Null before the first reply. */
  state: AreaState<T> | null;
  /** The whole request failed with nothing to show. */
  failed: boolean;
  onRetry(): void;
  children(ok: T): ReactNode;
}) {
  if (failed || state?.status === "failed")
    return (
      <CouldntLoad
        what={failedText(area).replace(/^Couldn't load /, "")}
        onRetry={onRetry}
      />
    );
  if (!state) return <Loading label={`Loading ${area}`} />;
  return (
    <>
      <p className="mb-3 text-[12.5px] text-ink-3">
        {updatedLine(state.updated_at)}
      </p>
      {children(state)}
    </>
  );
}
