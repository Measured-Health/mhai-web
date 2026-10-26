"use client";
import type { ReactNode } from "react";
import {
  figText,
  type Fig,
  type TableColumn,
  type TableSpec,
} from "@/lib/analysis/tables";
import { cn } from "@mhai/ui/cn";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";

export type DataColumn = TableColumn;
/** Words, a guarded figure (read in the screen's words), or any node. */
export type DataCell = Fig | ReactNode;
export type DataRow = { id: string; cells: Record<string, DataCell> };

const isFig = (c: DataCell): c is Exclude<Fig, string> =>
  typeof c === "object" && c !== null && "g" in c && "kind" in c;
const show = (c: DataCell | undefined): ReactNode =>
  c === undefined ? null : isFig(c) ? figText(c) : c;

/** A view's tables from `tables.ts`, the same ones the CSV writes. */
export function SpecTables({ tables }: { tables: readonly TableSpec[] }) {
  return (
    <>
      {tables.map((t) => (
        <DataTable
          key={t.caption}
          caption={t.caption}
          columns={t.columns}
          rows={t.rows}
        />
      ))}
    </>
  );
}

/**
 * A view's figures as a table on `md` and up, and as cards below it, so
 * nothing scrolls sideways on a phone. Hidden cells read in the screen's
 * words: "Fewer than 5", "Not shown" or "Too few hospitals to show".
 */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: DataColumn[];
  rows: DataRow[];
}) {
  const desktop = useIsDesktop();
  if (!desktop) {
    const [first, ...rest] = columns;
    return (
      <ul aria-label={caption} className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-line bg-white px-3.5 py-3"
          >
            {first && (
              <p className="text-[14px] font-semibold">
                {show(r.cells[first.key])}
              </p>
            )}
            <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
              {rest.map((c) => (
                <div key={c.key} className="contents">
                  <dt className="text-ink-3">{c.label}</dt>
                  <dd className="break-words text-right font-semibold tabular-nums">
                    {show(r.cells[c.key])}
                  </dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <caption className="pb-2 text-left text-[13px] font-semibold text-ink-2">
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-line text-ink-3">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-2 py-2 font-semibold",
                  c.numeric ? "text-right" : "text-left",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-2 py-2",
                    c.numeric && "text-right tabular-nums",
                  )}
                >
                  {show(r.cells[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
