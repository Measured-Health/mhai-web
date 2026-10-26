"use client";
import { ArrowDown, ArrowUp, ArrowUpDown, TriangleAlert } from "lucide-react";
import { useId, useState } from "react";
import type { AGuarded, HospitalRow, Rate } from "@/lib/api/analysis-contract";
import {
  COVERAGE_LABEL,
  KIND_LABEL,
  PARTLY_STANDARDISED,
  headlineText,
  valueText,
} from "@/lib/analysis/labels";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Chip } from "@mhai/ui/chip";
import { cn } from "@mhai/ui/cn";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";

/** How a headline reads: per 1,000, or (Quality's agreement rate) a percentage. */
export type HeadlineKind = "rate" | "share";

/**
 * A rate with its count beside it, never a count alone: "12.4 per 1,000 ·
 * 25". When both read the same words (both hidden), they read once.
 */
export function rateWithCount(rate: Rate, kind: HeadlineKind = "rate"): string {
  const r = headlineText(rate.per_1000, kind);
  const c = valueText(rate.count, "count");
  return r === c ? r : `${r} · ${c}`;
}

type SortKey =
  "hospital" | "size" | "headline" | "kind" | "coverage" | "not_standardised";
type Dir = "ascending" | "descending";

/** A shown number to sort by; null for hidden or empty, which always go last. */
const shownNumber = (g: AGuarded) =>
  g.suppressed || g.value === null ? null : g.value;

function sortKeyOf(r: HospitalRow, key: SortKey): number | string | null {
  switch (key) {
    case "hospital":
      return r.hospital.name;
    case "size":
      return shownNumber(r.size);
    case "headline":
      return shownNumber(r.headline.per_1000);
    case "kind":
      return KIND_LABEL[r.kind];
    case "coverage":
      return COVERAGE_LABEL[r.coverage];
    case "not_standardised":
      return shownNumber(r.not_standardised_share);
  }
}

/**
 * Sorted so the order never shows size: a hidden value has no place among
 * the shown ones, so hidden rows go last in either direction, by name.
 */
export function sortRows(
  rows: readonly HospitalRow[],
  key: SortKey,
  dir: Dir,
): HospitalRow[] {
  const byName = (a: HospitalRow, b: HospitalRow) =>
    a.hospital.name.localeCompare(b.hospital.name);
  const sign = dir === "ascending" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortKeyOf(a, key);
    const y = sortKeyOf(b, key);
    if (x === null || y === null) {
      if (x === null && y === null) return byName(a, b);
      return x === null ? 1 : -1;
    }
    const d =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y));
    return d !== 0 ? sign * d : byName(a, b);
  });
}

const TEXT_KEYS = new Set<SortKey>(["hospital", "kind", "coverage"]);
/** Numbers start largest first; words start A to Z. */
const firstDir = (key: SortKey): Dir =>
  TEXT_KEYS.has(key) ? "ascending" : "descending";

function PartlyChip() {
  return (
    <Chip tone="warn">
      <TriangleAlert aria-hidden className="size-3" />
      {PARTLY_STANDARDISED}
    </Chip>
  );
}

/**
 * Every hospital's own figures across hospitals (spec §4): Hospital,
 * Patients seen, the headline rate with its count, Kind, Coverage and Not
 * standardised. Sortable; a table on `md` and up, cards below. Hidden
 * values read "Fewer than 5". No number is a link.
 */
export function HospitalRows({
  rows,
  headlineLabel,
  headlineKind = "rate",
}: {
  rows: readonly HospitalRow[];
  /** The headline column, e.g. "Cases per 1,000". */
  headlineLabel: string;
  headlineKind?: HeadlineKind;
}) {
  const desktop = useIsDesktop();
  const sortId = useId();
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({
    key: "hospital",
    dir: "ascending",
  });
  const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
    { key: "hospital", label: "Hospital" },
    { key: "size", label: "Patients seen", numeric: true },
    { key: "headline", label: headlineLabel, numeric: true },
    { key: "kind", label: "Kind" },
    { key: "coverage", label: "Coverage" },
    { key: "not_standardised", label: "Not standardised", numeric: true },
  ];
  const sorted = sortRows(rows, sort.key, sort.dir);
  const cells = (r: HospitalRow): Record<SortKey, string> => ({
    hospital: r.hospital.name,
    size: valueText(r.size, "count"),
    headline: rateWithCount(r.headline, headlineKind),
    kind: KIND_LABEL[r.kind],
    coverage: COVERAGE_LABEL[r.coverage],
    not_standardised: valueText(r.not_standardised_share, "share"),
  });
  const sortBy = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "ascending" ? "descending" : "ascending" }
        : { key, dir: firstDir(key) },
    );

  if (!desktop) {
    const text = TEXT_KEYS.has(sort.key);
    const current =
      sort.dir === "ascending"
        ? text
          ? "A to Z"
          : "Smallest first"
        : text
          ? "Z to A"
          : "Largest first";
    const other =
      sort.dir === "ascending"
        ? text
          ? "Z to A"
          : "Largest first"
        : text
          ? "A to Z"
          : "Smallest first";
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-[14px] font-semibold">By hospital</h3>
        <div className="flex flex-wrap items-end gap-2">
          <label
            htmlFor={sortId}
            className="flex flex-1 flex-col gap-1 text-[12.5px] font-semibold text-ink-2"
          >
            Sort hospitals by
            <select
              id={sortId}
              value={sort.key}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                setSort({ key, dir: firstDir(key) });
              }}
              className={inputClass}
            >
              {columns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => sortBy(sort.key)}
            aria-label={`Sorted ${current}. Show ${other}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            <ArrowUpDown aria-hidden className="size-3.5" />
            {other}
          </button>
        </div>
        <ul aria-label="By hospital" className="flex flex-col gap-2">
          {sorted.map((r) => {
            const c = cells(r);
            return (
              <li
                key={r.hospital.id}
                className="rounded-xl border border-line bg-white px-3.5 py-3"
              >
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
                  {r.hospital.name}
                  {r.partly_standardised && <PartlyChip />}
                </p>
                <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                  {columns.slice(1).map((col) => (
                    <div key={col.key} className="contents">
                      <dt className="text-ink-3">{col.label}</dt>
                      <dd className="break-words text-right font-semibold tabular-nums">
                        {c[col.key]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <caption className="pb-2 text-left text-[14px] font-semibold">
          By hospital
        </caption>
        <thead>
          <tr className="border-b border-line text-ink-3">
            {columns.map((c) => {
              const on = sort.key === c.key;
              const Icon = !on
                ? ArrowUpDown
                : sort.dir === "ascending"
                  ? ArrowUp
                  : ArrowDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={on ? sort.dir : "none"}
                  className={cn(
                    "px-1 py-1 font-semibold",
                    c.numeric ? "text-right" : "text-left",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => sortBy(c.key)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1 rounded-md px-1 focus-visible:outline-2 focus-visible:outline-mint-deep",
                      on && "text-ink",
                    )}
                  >
                    {c.label}
                    <Icon aria-hidden className="size-3.5 shrink-0" />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const c = cells(r);
            return (
              <tr
                key={r.hospital.id}
                className="border-b border-line last:border-0"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-2 py-2",
                      col.numeric && "text-right tabular-nums",
                    )}
                  >
                    {col.key === "hospital" ? (
                      <span className="flex flex-wrap items-center gap-2">
                        {r.hospital.name}
                        {r.partly_standardised && <PartlyChip />}
                      </span>
                    ) : (
                      c[col.key]
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
