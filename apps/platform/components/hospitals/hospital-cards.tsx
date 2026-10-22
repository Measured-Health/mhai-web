import Link from "next/link";
import type { HospitalSummary } from "@/lib/api/contract";
import { activityLabel, dateLabel } from "./format";
import { HoldTag } from "./hold-tag";
import { StatusChip } from "./status-chip";

/** The hospitals as cards, on phones. */
export function HospitalCards({ rows }: { rows: HospitalSummary[] }) {
  return (
    <ul aria-label="Hospitals" className="flex flex-col gap-3">
      {rows.map((h) => (
        <li key={h.id} className="card-v3 px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <Link
              href={`/hospitals/${h.id}`}
              className="flex min-h-11 min-w-0 flex-col justify-center font-semibold text-bloom [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-mint-deep"
            >
              {h.name}
              <small className="font-mono text-[12px] font-normal text-ink-3">
                {h.short_code}
              </small>
            </Link>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {h.legal_holds_active > 0 && <HoldTag />}
              <StatusChip status={h.status} />
            </div>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
            <div>
              <dt className="text-ink-3">Staff</dt>
              <dd>{h.staff_count}</dd>
            </div>
            <div>
              <dt className="text-ink-3">SSO</dt>
              <dd>{h.sso_enabled ? "On" : "Off"}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Created</dt>
              <dd>{dateLabel(h.created_at)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Last activity</dt>
              <dd>{activityLabel(h.last_activity_at)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}
