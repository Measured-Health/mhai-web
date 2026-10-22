"use client";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useId, useState, type Ref } from "react";
import type { Guarded, MeasureId, Period } from "@/lib/api/analytics-contract";
import type { Person } from "@/lib/api/contract";
import type { RankedChange } from "@/lib/analytics/changes";
import {
  COMPARE_MEASURES,
  countText,
  isHidden,
  measureLabel,
  valueText,
  type MeasureKind,
} from "@/lib/analytics/measures";
import type { AnalyticsState } from "@/lib/analytics/read";
import { useHospitalSeries } from "@/lib/queries/analytics";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { CouldntLoad } from "../states/couldnt-load";
import { Loading } from "../states/loading";
import { AreaPanel } from "./area-panel";
import { sizeLine } from "./change-detail";
import { ComparePanel } from "./compare-chart";
import { openHospitalClass } from "./contact-admins";

const FALLBACK: MeasureId = "questions_per_clinician";

/**
 * The comparison opens on the first measure (in the picker's order) that
 * has a change for this hospital, else questions per clinician.
 */
export function defaultMeasure(
  items: readonly RankedChange[],
  hospitalId: string,
): MeasureId {
  return (
    COMPARE_MEASURES.find((m) =>
      items.some((c) => c.hospital?.id === hospitalId && c.measure === m),
    ) ?? FALLBACK
  );
}

type Row = {
  hospital: Person;
  staff: number;
  /** Null: that area could not be loaded. */
  cells: Record<ColKey, Guarded | null | undefined>;
};
type ColKey =
  | "questions"
  | "per_clinician"
  | "critical_median"
  | "critical_within"
  | "needs_review";

type Col =
  | { key: "hospital"; label: string }
  | { key: "staff"; label: string }
  | { key: ColKey; label: string; kind: MeasureKind };
const COLS: Col[] = [
  { key: "hospital", label: "Hospital" },
  { key: "staff", label: "Staff" },
  { key: "questions", label: "Questions", kind: "count" },
  { key: "per_clinician", label: "Questions per clinician", kind: "rate" },
  { key: "critical_median", label: "Critical median", kind: "minutes" },
  { key: "critical_within", label: "Critical within target", kind: "share" },
  { key: "needs_review", label: "Needs review", kind: "share" },
];

/** What a column sorts by; hidden and missing values sort last. */
function sortValue(r: Row, c: Col): number | string | null {
  if (c.key === "hospital") return r.hospital.name.toLowerCase();
  if (c.key === "staff") return r.staff;
  const g = r.cells[c.key];
  if (!g || isHidden(g, c.kind) || g.value === null) return null;
  return g.value;
}

/**
 * Hospitals: one row per active hospital, sortable. Picking a row puts
 * that hospital in the right-hand panel. Each number comes from its own
 * area, so one area failing leaves the rest of the row readable.
 */
export function HospitalsTab({
  state,
  failed,
  onRetry,
  pickedId,
  onPick,
}: {
  state: AnalyticsState | null;
  failed: boolean;
  onRetry(): void;
  pickedId: string | null;
  onPick(hospital: Person): void;
}) {
  const [sort, setSort] = useState<{ key: Col["key"]; dir: 1 | -1 } | null>(
    null,
  );
  const captionId = useId();
  return (
    <AreaPanel
      area="hospitals"
      state={state?.hospitals ?? null}
      failed={failed}
      onRetry={onRetry}
    >
      {(h) => {
        // An ok hospitals area means there is a state.
        const all = state!;
        const by = <R extends { hospital: Person }>(
          a: { status: "ok"; rows: R[] } | { status: "failed" },
          id: string,
        ) =>
          a.status === "ok" ? a.rows.find((r) => r.hospital.id === id) : null;
        const rows: Row[] = h.rows.map(({ hospital, size }) => {
          const u = by(all.use, hospital.id);
          const a = by(all.alerts, hospital.id);
          const q = by(all.quality, hospital.id);
          return {
            hospital,
            staff: size.staff,
            cells: {
              questions: u === null ? null : u?.questions,
              per_clinician: u === null ? null : u?.questions_per_clinician,
              critical_median:
                a === null ? null : a?.critical_median_ack_minutes,
              critical_within: a === null ? null : a?.critical_within_target,
              needs_review: q === null ? null : q?.needs_review_share,
            },
          };
        });
        const col = sort ? COLS.find((c) => c.key === sort.key)! : null;
        const shown = col
          ? [...rows].sort((x, y) => {
              const a = sortValue(x, col);
              const b = sortValue(y, col);
              if (a === null || b === null)
                return Number(a === null) - Number(b === null);
              return (
                (typeof a === "string"
                  ? a.localeCompare(b as string)
                  : a - (b as number)) * sort!.dir
              );
            })
          : rows;
        const press = (key: Col["key"]) =>
          setSort((s) => ({
            key,
            dir: s?.key === key && s.dir === 1 ? -1 : 1,
          }));
        return (
          <div className="max-sm:overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <caption id={captionId} className="sr-only">
                Hospitals: pick one to compare it with the others
              </caption>
              <thead>
                <tr className="border-b border-line text-ink-3">
                  {COLS.map((c) => {
                    const on = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={
                          on
                            ? sort.dir === 1
                              ? "ascending"
                              : "descending"
                            : undefined
                        }
                        className={cn(
                          "font-semibold",
                          c.key === "hospital" ? "text-left" : "text-right",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => press(c.key)}
                          className="min-h-11 px-1.5 font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep"
                        >
                          {c.label}
                          <span aria-hidden className="ml-1">
                            {on ? (sort.dir === 1 ? "▲" : "▼") : ""}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr
                    key={r.hospital.id}
                    className="border-b border-line last:border-0"
                  >
                    <th scope="row" className="text-left font-normal">
                      <button
                        type="button"
                        aria-current={
                          r.hospital.id === pickedId ? "true" : undefined
                        }
                        onClick={() => onPick(r.hospital)}
                        className={cn(
                          "min-h-11 w-full rounded-lg px-1.5 text-left font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep",
                          r.hospital.id === pickedId && "bg-mint/10",
                        )}
                      >
                        {r.hospital.name}
                      </button>
                    </th>
                    <td className="px-1.5 text-right font-mono">
                      {countText(r.staff)}
                    </td>
                    {COLS.slice(2).map((c) => {
                      const k = c as Extract<Col, { kind: MeasureKind }>;
                      const g = r.cells[k.key];
                      return (
                        <td key={k.key} className="px-1.5 text-right font-mono">
                          {g === null
                            ? "Couldn't load"
                            : g === undefined
                              ? "No data yet"
                              : valueText(g, k.kind)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }}
    </AreaPanel>
  );
}

/**
 * The right-hand panel for a picked hospital: a measure select and the
 * same comparison against the median of the others as a change shows.
 */
export function HospitalDetail({
  hospital,
  measure,
  onMeasure,
  period,
  hospitals,
  onBack,
  headingRef,
}: {
  hospital: Person;
  measure: MeasureId;
  onMeasure(m: MeasureId): void;
  period: Period;
  hospitals: AnalyticsState["hospitals"];
  onBack?(): void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const titleId = useId();
  const series = useHospitalSeries(hospital.id, measure, period);
  const size =
    hospitals.status === "ok"
      ? hospitals.rows.find((r) => r.hospital.id === hospital.id)?.size
      : undefined;
  return (
    <section
      aria-labelledby={titleId}
      className="card-v3 flex flex-col gap-4 px-[22px] py-5"
    >
      {onBack && (
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 self-start"
          onClick={onBack}
        >
          <ArrowLeft aria-hidden className="size-4" />
          Back
        </Button>
      )}
      <div>
        <p className="text-[12.5px] text-ink-3">Selected hospital</p>
        <h2
          id={titleId}
          ref={headingRef}
          tabIndex={-1}
          className="text-[15px] font-semibold focus:outline-none"
        >
          {hospital.name} compared with the others
        </h2>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
        Measure
        <select
          value={measure}
          onChange={(e) => onMeasure(e.target.value as MeasureId)}
          className={`${inputClass} min-h-11 w-auto`}
        >
          {COMPARE_MEASURES.map((m) => (
            <option key={m} value={m}>
              {measureLabel(m)}
            </option>
          ))}
        </select>
      </label>
      {series.isError ? (
        <CouldntLoad what="the chart" onRetry={() => void series.refetch()} />
      ) : !series.data ? (
        <Loading label="Loading the chart" />
      ) : (
        <ComparePanel
          hospital={hospital}
          series={series.data}
          size={size ? sizeLine(size) : null}
        />
      )}
      <Link href={`/hospitals/${hospital.id}`} className={openHospitalClass}>
        Open hospital
      </Link>
    </section>
  );
}
