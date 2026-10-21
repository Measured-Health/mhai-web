import Link from "next/link";
import type { HospitalSummary } from "@/lib/api/contract";
import { activityLabel, dateLabel } from "./format";
import { StatusChip } from "./status-chip";

const HEADERS = ["Name", "Status", "Staff", "SSO", "Created", "Last activity"];

/** The hospitals table, from `md`. */
export function HospitalTable({ rows }: { rows: HospitalSummary[] }) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-[13px]">
        <caption className="sr-only">Hospitals</caption>
        <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
          <tr>
            {HEADERS.map((h) => (
              <th key={h} scope="col" className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((h) => (
            <tr key={h.id} className="border-t border-line">
              <th scope="row" className="px-4 py-3 text-left font-normal">
                <Link
                  href={`/hospitals/${h.id}`}
                  className="font-semibold text-bloom underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep"
                >
                  {h.name}
                </Link>
                <small className="block font-mono text-[12px] text-ink-3">
                  {h.short_code}
                </small>
              </th>
              <td className="px-4 py-3">
                <StatusChip status={h.status} />
              </td>
              <td className="px-4 py-3">{h.staff_count}</td>
              <td className="px-4 py-3">{h.sso_enabled ? "On" : "Off"}</td>
              <td className="px-4 py-3">{dateLabel(h.created_at)}</td>
              <td className="px-4 py-3">{activityLabel(h.last_activity_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
