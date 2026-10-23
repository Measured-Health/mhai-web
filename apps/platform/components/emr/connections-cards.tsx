import Link from "next/link";
import { num } from "@/lib/format";
import { syncLine } from "@/lib/emr/labels";
import { connectionState } from "@/lib/emr/state";
import { ConnectionChip, NotConnectedChip } from "./connection-chip";
import type { ConnectionRow } from "./connection-rows";
import { ADD_LINK_CLASS, addHref } from "./connections-table";

/** The connections as cards, on phones. */
export function ConnectionsCards({
  rows,
  canAdd,
  now,
}: {
  rows: ConnectionRow[];
  canAdd: boolean;
  now: number;
}) {
  return (
    <ul aria-label="Patient record connections" className="flex flex-col gap-3">
      {rows.map((r) =>
        r.kind === "connection" ? (
          <li key={r.c.id} className="card-v3 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/connections/${r.c.id}`}
                className="flex min-h-11 min-w-0 flex-col justify-center font-semibold text-bloom [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-mint-deep"
              >
                {r.c.source_label}
                <small className="font-normal text-ink-3">
                  {r.c.hospital.name}
                </small>
              </Link>
              <ConnectionChip state={connectionState(r.c)} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
              <div>
                <dt className="text-ink-3">Type</dt>
                <dd>{r.c.type_label}</dd>
              </div>
              <div>
                <dt className="text-ink-3">Problems (24 h)</dt>
                <dd>{r.c.errors_24h > 0 ? num(r.c.errors_24h) : "None"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="sr-only">Last update</dt>
                <dd>{syncLine(r.c, now)}</dd>
              </div>
            </dl>
          </li>
        ) : (
          <li key={`none-${r.hospital.id}`} className="card-v3 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">
                {r.hospital.name}
              </span>
              <NotConnectedChip />
            </div>
            {canAdd && (
              <Link href={addHref(r.hospital.id)} className={ADD_LINK_CLASS}>
                Add a connection
              </Link>
            )}
          </li>
        ),
      )}
    </ul>
  );
}
