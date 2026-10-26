"use client";
import { ChevronDown, Download } from "lucide-react";
import { useId, useState } from "react";
import type {
  AnalysisPeriod,
  AnalysisQuery,
  AnalysisStatus,
  ScopeKind,
} from "@/lib/api/analysis-contract";
import { PERIODS } from "@/lib/analysis/filters";
import {
  EXCLUDED_TEXT,
  FILTERS_CLEARED,
  SAMPLE_DATA,
  SCOPE_LABEL,
  includedText,
  periodLabel,
} from "@/lib/analysis/labels";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { Button } from "@mhai/ui/button";
import { Chip } from "@mhai/ui/chip";
import { cn } from "@mhai/ui/cn";
import { OFFLINE_NOTE, OfflineNote } from "../states/offline-strip";

export const RECORD_FAILED =
  "Couldn't record the download, so it didn't start. Try again.";

/**
 * The page's header: the Sample data sign, the scope (All hospitals, or
 * One hospital and which), the period, who is included (and who isn't,
 * with why), and Download CSV.
 */
export function AnalysisHeader({
  status,
  query,
  cleared,
  onScope,
  onPeriod,
  canDownload,
  downloading,
  downloadFailed,
  onDownload,
  offline,
}: {
  status: AnalysisStatus;
  query: AnalysisQuery;
  /** The last scope switch cleared filters: say so. */
  cleared: boolean;
  onScope(scope: ScopeKind, hospital: string | null): void;
  onPeriod(p: AnalysisPeriod): void;
  canDownload: boolean;
  downloading: boolean;
  downloadFailed: boolean;
  onDownload(): void;
  offline: boolean;
}) {
  const id = useId();
  const [showExcluded, setShowExcluded] = useState(false);
  const list = status.hospitals.list;
  const excluded = status.hospitals.excluded;
  const offlineId = `${id}-offline`;
  const offProps = offline
    ? { title: OFFLINE_NOTE, "aria-describedby": offlineId }
    : {};

  return (
    <section
      aria-label="Scope and period"
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        {status.sample && (
          <Chip tone="warn" className="self-center">
            {SAMPLE_DATA}
          </Chip>
        )}
        <div
          role="group"
          aria-label="Scope"
          className="flex gap-1 rounded-full bg-bg p-1"
        >
          {(["all", "hospital"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={query.scope === s}
              disabled={offline || list.length === 0}
              {...offProps}
              onClick={() =>
                s === "all"
                  ? onScope("all", null)
                  : query.scope !== "hospital" &&
                    onScope("hospital", list[0]!.id)
              }
              className={cn(
                "min-h-11 rounded-full px-3.5 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep disabled:opacity-40",
                query.scope === s
                  ? "bg-white text-ink shadow-sm"
                  : "text-ink-3",
              )}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        {query.scope === "hospital" && (
          <label className="flex w-full min-w-0 flex-col gap-1 text-[12.5px] font-semibold text-ink-2 sm:w-auto">
            Hospital
            <select
              value={query.hospital ?? ""}
              disabled={offline}
              {...offProps}
              onChange={(e) => onScope("hospital", e.target.value)}
              className={cn(inputClass, "sm:w-64")}
            >
              {list.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex w-full min-w-0 flex-col gap-1 text-[12.5px] font-semibold text-ink-2 sm:w-auto">
          Period
          <select
            value={query.period}
            disabled={offline}
            {...offProps}
            onChange={(e) => onPeriod(e.target.value as AnalysisPeriod)}
            className={cn(inputClass, "sm:w-48")}
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="ghost"
          className="w-full sm:ml-auto sm:w-auto"
          disabled={!canDownload || downloading || offline}
          {...offProps}
          onClick={onDownload}
        >
          <Download aria-hidden className="size-4" />
          Download CSV
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
        <span>{includedText(status)}</span>
        {excluded.length > 0 && (
          <button
            type="button"
            aria-expanded={showExcluded}
            aria-controls={`${id}-excluded`}
            onClick={() => setShowExcluded((v) => !v)}
            className="inline-flex min-h-11 items-center gap-1 font-semibold text-mint-deep underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-mint-deep"
          >
            See which aren&apos;t
            <ChevronDown
              aria-hidden
              className={cn("size-3.5", showExcluded && "rotate-180")}
            />
          </button>
        )}
      </div>
      {showExcluded && (
        <ul
          id={`${id}-excluded`}
          aria-label="Hospitals not included"
          className="flex flex-col gap-1 text-[13px] text-ink-2"
        >
          {excluded.map((x) => (
            <li key={x.id}>
              <span className="font-semibold">{x.name}</span>:{" "}
              {EXCLUDED_TEXT[x.reason]}
            </li>
          ))}
        </ul>
      )}
      {cleared && (
        <p role="status" className="text-[13px] text-ink-2">
          {FILTERS_CLEARED}
        </p>
      )}
      {downloadFailed && (
        <p role="alert" className="text-[13px] font-semibold text-bad-deep">
          {RECORD_FAILED}
        </p>
      )}
      <div id={offlineId}>
        <OfflineNote id={`${offlineId}-note`} />
      </div>
    </section>
  );
}
