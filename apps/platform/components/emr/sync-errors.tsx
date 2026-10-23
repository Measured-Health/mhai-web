import type { SyncError } from "@/lib/api/emr-contract";
import { syncErrorLabel } from "@/lib/emr/labels";
import { whenLabel } from "@/lib/emr/when";

/** The last day's problems, in words, with the time and how often. */
export function SyncErrors({ errors }: { errors: SyncError[] }) {
  if (errors.length === 0)
    return (
      <p className="text-[13.5px] text-ink-3">
        No problems in the last 24 hours.
      </p>
    );
  return (
    <ul className="divide-y divide-line">
      {errors.map((e) => (
        <li
          key={`${e.at}-${e.code}`}
          className="flex flex-wrap items-baseline gap-x-2 py-2.5 text-[13.5px]"
        >
          <span className="[overflow-wrap:anywhere]">
            {`${syncErrorLabel(e.code)} · `}
            <time dateTime={e.at}>{whenLabel(e.at)}</time>
          </span>
          {e.count > 1 && (
            <span className="font-semibold text-ink-2">{`×${e.count}`}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
