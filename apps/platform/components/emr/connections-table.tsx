import Link from "next/link";
import { num } from "@/lib/format";
import { syncLine } from "@/lib/emr/labels";
import { connectionState } from "@/lib/emr/state";
import { ConnectionChip, NotConnectedChip } from "./connection-chip";
import { lastUpdate, type ConnectionRow } from "./connection-rows";

const HEADERS = [
  "Hospital",
  "Name the hospital sees",
  "Type",
  "State",
  "Last update",
  "Problems (24 h)",
];

export const addHref = (hospitalId: string) =>
  `/connections/new?hospital=${encodeURIComponent(hospitalId)}`;
export const ADD_LINK_CLASS =
  "inline-flex min-h-11 items-center font-semibold text-bloom underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep sm:min-h-0";

/** The connections table, from `md`. */
export function ConnectionsTable({
  rows,
  canAdd,
  now,
}: {
  rows: ConnectionRow[];
  canAdd: boolean;
  now: number;
}) {
  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-[13px]">
        <caption className="sr-only">Patient record connections</caption>
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
          {rows.map((r) =>
            r.kind === "connection" ? (
              <tr key={r.c.id} className="border-t border-line">
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  {r.c.hospital.name}
                </th>
                <td className="px-4 py-3">
                  <Link
                    href={`/connections/${r.c.id}`}
                    className="font-semibold text-bloom underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep"
                  >
                    {r.c.source_label}
                  </Link>
                </td>
                <td className="px-4 py-3">{r.c.type_label}</td>
                <td className="px-4 py-3">
                  <ConnectionChip state={connectionState(r.c)} />
                </td>
                <td className="px-4 py-3">{lastUpdate(syncLine(r.c, now))}</td>
                <td className="px-4 py-3">
                  {r.c.errors_24h > 0 ? num(r.c.errors_24h) : "None"}
                </td>
              </tr>
            ) : (
              <tr
                key={`none-${r.hospital.id}`}
                className="border-t border-line"
              >
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  {r.hospital.name}
                </th>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3">—</td>
                <td className="px-4 py-3">
                  <NotConnectedChip />
                </td>
                <td className="px-4 py-3" colSpan={2}>
                  {canAdd && (
                    <Link
                      href={addHref(r.hospital.id)}
                      className={ADD_LINK_CLASS}
                    >
                      Add a connection
                    </Link>
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
