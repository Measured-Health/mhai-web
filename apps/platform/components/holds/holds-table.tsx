import Link from "next/link";
import type { LegalHold } from "@/lib/api/holds-contract";
import { dateLabel } from "@/lib/format";
import { holdReasonLabel } from "@/lib/holds/labels";
import { scopeLabel } from "@/lib/holds/rules";
import { HoldStatus } from "./hold-status";

const HEADERS = [
  "Hospital",
  "What it covers",
  "Reason",
  "Reference",
  "Placed",
  "Review date",
  "Status",
];

/** The holds table, from `md`. Each row opens the hold. */
export function HoldsTable({ rows }: { rows: LegalHold[] }) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-[13px]">
        <caption className="sr-only">Legal holds</caption>
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
            <tr key={h.id} className="border-t border-line align-top">
              <th scope="row" className="px-4 py-3 text-left font-normal">
                <Link
                  href={`/legal-holds/${h.id}`}
                  className="font-semibold text-bloom underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep"
                >
                  {h.hospital.name}
                </Link>
              </th>
              <td className="px-4 py-3">{scopeLabel(h.scope)}</td>
              <td className="px-4 py-3">{holdReasonLabel(h.reason)}</td>
              <td className="px-4 py-3 font-mono text-[12px] [overflow-wrap:anywhere]">
                {h.reference}
              </td>
              <td className="px-4 py-3">{dateLabel(h.placed_at)}</td>
              <td className="px-4 py-3">{dateLabel(h.review_on)}</td>
              <td className="px-4 py-3">
                <HoldStatus hold={h} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
