import Link from "next/link";
import type { Person } from "@/lib/api/contract";
import { dateLabel } from "@/lib/format";

/**
 * "Changed by {name} · {date}", with a History link to Activity (which has
 * no setting filter). Nothing when it has never been changed.
 */
export function ChangedLine({
  by,
  at,
}: {
  by: Person | null;
  at: string | null;
}) {
  if (!by || !at) return null;
  return (
    <p className="text-[12.5px] text-ink-3 [overflow-wrap:anywhere]">
      Changed by {by.name} · {dateLabel(at)} ·{" "}
      <Link
        href="/activity"
        className="font-semibold text-bloom underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep"
      >
        History
      </Link>
    </p>
  );
}
