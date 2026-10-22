"use client";
import type { HoldEvent } from "@/lib/api/holds-contract";
import { dateLabel } from "@/lib/format";
import { holdEventIsKnown, holdEventLabel } from "@/lib/holds/labels";
import { Section } from "../hospitals/section";
import { CouldntLoad } from "../states/couldnt-load";

/**
 * A hold's history, newest first: what happened, who did it and when, with
 * the server's detail (the reason's words, or which fields changed). The
 * note is never part of it.
 */
export function HoldHistory({
  events,
  onRetry,
}: {
  events: HoldEvent[];
  onRetry(): void;
}) {
  // An event this app has no words for fails the block, never printed raw.
  const known = events.every(holdEventIsKnown);
  const rows = [...events].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return (
    <Section title="History">
      {!known ? (
        <CouldntLoad what="history" onRetry={onRetry} />
      ) : (
        <ol aria-label="History" className="flex flex-col gap-3">
          {rows.map((e, i) => (
            <li key={`${e.at}-${e.action}-${i}`} className="text-[13.5px]">
              <b className="block font-semibold">{holdEventLabel(e.action)}</b>
              <span className="text-ink-2 [overflow-wrap:anywhere]">
                {e.actor.name} · {dateLabel(e.at)}
                {e.detail ? ` · ${e.detail}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
