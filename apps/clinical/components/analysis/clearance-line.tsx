"use client";
import { FileCheck2, FileX2, OctagonAlert } from "lucide-react";
import { useClearanceMe, useNamedAccessOn } from "@/lib/analysis-queries";
import { namedNow } from "@/lib/analysis/named";
import { instantLabel } from "@/lib/clearances/status";
import { Button } from "@mhai/ui/button";
import { ENDING_SOON_DAYS, daysBetween } from "@mhai/ui/clearances";

/** An instant as the viewer's own day, "YYYY-MM-DD". */
function viewerDay(ms: number): string {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** "· ends in 12 days" within 30 days of the end, else nothing. */
function endsIn(until: string, now: number): string {
  const left = daysBetween(viewerDay(now), viewerDay(Date.parse(until)));
  if (left > ENDING_SOON_DAYS) return "";
  if (left <= 0) return " · ends today";
  return left === 1 ? " · ends in 1 day" : ` · ends in ${left} days`;
}

/**
 * The signed-in person's named access on the Analysis page, only while the
 * switch is On: "Named access until {date} · letter on file" (with "· ends
 * in {n} days" in the last 30), or "No named access". Read from
 * `clearance/me`; a reply that can't be read, or whose end has passed, is
 * no access. Word and icon, never colour alone.
 */
export function ClearanceLine() {
  const on = useNamedAccessOn();
  const me = useClearanceMe({ poll: false });
  if (!on) return null;
  if (me.data === undefined)
    return me.isError ? (
      <p
        role="alert"
        className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2"
      >
        <OctagonAlert aria-hidden className="size-4 shrink-0 text-bad-deep" />
        Couldn&apos;t load your named access
        <Button
          size="sm"
          variant="ghost"
          className="min-h-11"
          onClick={() => void me.refetch()}
        >
          Try again
        </Button>
      </p>
    ) : null;
  // When the reply was read: an `until` already past then is no access.
  const now = me.dataUpdatedAt;
  const until = namedNow(me.data, now) ? me.data!.until! : null;
  const day = until === null ? null : instantLabel(until);
  return day !== null && until !== null ? (
    <p className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
      <FileCheck2 aria-hidden className="size-4 shrink-0 text-mint-deep" />
      {`Named access until ${day} · letter on file${endsIn(until, now)}`}
    </p>
  ) : (
    <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3">
      <FileX2 aria-hidden className="size-4 shrink-0" />
      No named access
    </p>
  );
}
