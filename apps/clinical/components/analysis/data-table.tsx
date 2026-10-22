"use client";
import { isValidElement, type ReactNode } from "react";
import type { GuardedOut } from "@/lib/api/admin-contract";
import { isGuardedOut } from "@/lib/analysis/guards";
import { countText } from "@/lib/analysis/labels";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { cn } from "@mhai/ui/cn";

/** A count (read under the small-group rule) or any text. */
export type TableCell = GuardedOut | ReactNode;
export type TableColumn = {
  key: string;
  label: string;
  /** Counts line up on the right. */
  numeric?: boolean;
};
export type TableRow = { key: string; cells: Record<string, TableCell> };

const isGuarded = (c: TableCell): c is GuardedOut =>
  !isValidElement(c) && isGuardedOut(c);

/** A hidden count reads "Fewer than 5"; 0 reads "0". */
const cellText = (c: TableCell): ReactNode => (isGuarded(c) ? countText(c) : c);

/**
 * A view's numbers as a table from `md` (caption, header row, the first
 * column as the row's name), and as label-and-value cards below it.
 */
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly TableColumn[];
  rows: readonly TableRow[];
}) {
  const desktop = useIsDesktop();
  const [head, ...rest] = columns;
  if (!head) return null;

  if (!desktop)
    return (
      <div className="card-v3 px-4 py-3">
        <h3 className="mb-2 text-[14px] font-semibold">{caption}</h3>
        <ul aria-label={caption} className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.key}
              className="rounded-xl border border-line bg-white px-3 py-2.5 text-[13px]"
            >
              <b className="block font-semibold [overflow-wrap:anywhere]">
                {cellText(r.cells[head.key])}
              </b>
              <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-ink-3">{c.label}</dt>
                    <dd className="text-right font-mono [overflow-wrap:anywhere]">
                      {cellText(r.cells[c.key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <div className="card-v3 overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <caption className="px-4 pt-3 text-left text-[14px] font-semibold text-ink">
          {caption}
        </caption>
        <thead className="text-[11px] uppercase tracking-[.08em] text-ink-3">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-4 py-3 font-semibold",
                  c.numeric && "text-right",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line align-top">
              <th
                scope="row"
                className="px-4 py-2.5 font-normal [overflow-wrap:anywhere]"
              >
                {cellText(r.cells[head.key])}
              </th>
              {rest.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-4 py-2.5",
                    c.numeric && "text-right font-mono",
                  )}
                >
                  {cellText(r.cells[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
