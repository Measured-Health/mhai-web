import type { ErrorsValue } from "@/lib/ops/health";
import { errorKindLabel } from "@/lib/ops/labels";

/** Recent errors by kind: counts only, no messages. */
export function ErrorsBlock({ value }: { value: ErrorsValue }) {
  if (value.length === 0)
    return <p className="text-[14px] text-ink-2">No errors in this period.</p>;
  return (
    <ul aria-label="Recent errors" className="divide-y divide-line">
      {value.map((e) => (
        <li
          key={e.kind}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-[14px]"
        >
          <span className="font-semibold">{errorKindLabel[e.kind]}</span>
          <span className="text-ink-2">
            {e.last_hour} in the last hour · {e.last_24h} in the last 24 hours
          </span>
        </li>
      ))}
    </ul>
  );
}
