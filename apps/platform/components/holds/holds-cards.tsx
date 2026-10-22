import Link from "next/link";
import type { LegalHold } from "@/lib/api/holds-contract";
import { dateLabel } from "@/lib/format";
import { holdReasonLabel } from "@/lib/holds/labels";
import { scopeLabel } from "@/lib/holds/rules";
import { HoldStatus } from "./hold-status";

/** The holds as cards, on phones. */
export function HoldsCards({ rows }: { rows: LegalHold[] }) {
  return (
    <ul aria-label="Legal holds" className="flex flex-col gap-3">
      {rows.map((h) => (
        <li key={h.id} className="card-v3 px-4 py-3.5">
          <Link
            href={`/legal-holds/${h.id}`}
            className="flex min-h-11 items-center font-semibold text-bloom [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            {h.hospital.name}
          </Link>
          <div className="mt-1">
            <HoldStatus hold={h} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
            <div className="col-span-2">
              <dt className="text-ink-3">What it covers</dt>
              <dd>{scopeLabel(h.scope)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Reason</dt>
              <dd>{holdReasonLabel(h.reason)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Reference</dt>
              <dd className="font-mono [overflow-wrap:anywhere]">
                {h.reference}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Placed</dt>
              <dd>{dateLabel(h.placed_at)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Review date</dt>
              <dd>{dateLabel(h.review_on)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
