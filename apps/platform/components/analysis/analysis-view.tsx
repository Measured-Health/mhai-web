"use client";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type {
  AnalysisQuery,
  AnalysisStatus,
  FilterKey,
  ViewId,
} from "@/lib/api/analysis-contract";
import { analysisCsv, analysisCsvName } from "@/lib/analysis/csv";
import { emptyQuery, setFilter, switchScope } from "@/lib/analysis/filters";
import { VIEWS, VIEW_TITLE } from "@/lib/analysis/labels";
import type { ViewRead } from "@/lib/analysis/read";
import { takeHandedOffHospital } from "@/lib/analysis/scope-handoff";
import {
  useAnalysisFilters,
  useAnalysisView,
  useRecordDownload,
} from "@/lib/queries/analysis";
import { useNetwork } from "@mhai/api-client/network";
import { inputClass } from "@mhai/ui/auth/password-fields";
import { cn } from "@mhai/ui/cn";
import { downloadCsv } from "@mhai/ui/csv";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { AnalysisFilters } from "./analysis-filters";
import { AnalysisHeader } from "./analysis-header";
import { AffectedView } from "./affected-view";
import { CoOccurringView } from "./co-occurring-view";
import { FindingsView } from "./findings-view";
import { PrevalenceView } from "./prevalence-view";
import { QualityView } from "./quality-view";
import type { ChartOrTable } from "./view-frame";

/**
 * The Analysis page (spec §4): the header, the filters, the view picker and
 * one view at a time. Scope, hospital, period, filters and view live in
 * this component's state only: never the URL, storage, the title or logs.
 * Offline keeps what is loaded and disables what would ask again.
 */
export function AnalysisView({ status }: { status: AnalysisStatus }) {
  // A hospital page's "Analysis for this hospital" hands its hospital over
  // once, outside the URL; one Analysis leaves out opens All hospitals.
  const [query, setQuery] = useState<AnalysisQuery>(() => {
    const handed = takeHandedOffHospital();
    return handed && status.hospitals.list.some((h) => h.id === handed)
      ? emptyQuery("hospital", handed)
      : emptyQuery("all", null);
  });
  const [view, setView] = useState<ViewId>("prevalence");
  const [chartOrTable, setChartOrTable] = useState<ChartOrTable>("chart");
  const [cleared, setCleared] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const offline = !useNetwork().online;
  const desktop = useIsDesktop();
  const pickerId = useId();

  const options = useAnalysisFilters(query.scope, query.hospital);
  const read = useAnalysisView(view, query);
  const record = useRecordDownload();

  const change = (q: AnalysisQuery) => {
    setCleared(false);
    setDownloadFailed(false);
    setQuery(q);
  };
  const onSet = (key: FilterKey, value: string | null) =>
    change(setFilter(query, key, value));

  const download = async () => {
    const state = read.state;
    if (offline || state?.status !== "ok") return;
    setDownloadFailed(false);
    try {
      // Audited first: no record, no file.
      await record.mutateAsync({ view, query: state.query });
    } catch {
      setDownloadFailed(true);
      return;
    }
    downloadCsv(
      analysisCsvName(view, state.query, state.data.hospital?.name ?? null),
      analysisCsv(view, state, {
        status,
        options: options.state?.status === "ok" ? options.state.data : null,
      }),
    );
  };

  return (
    <>
      <AnalysisHeader
        status={status}
        query={query}
        cleared={cleared}
        onScope={(scope, hospital) => {
          const next = switchScope(query, scope, hospital);
          setDownloadFailed(false);
          setQuery(next.query);
          setCleared(next.cleared);
        }}
        onPeriod={(period) => change({ ...query, period })}
        canDownload={read.state?.status === "ok"}
        downloading={record.isPending}
        downloadFailed={downloadFailed}
        onDownload={() => void download()}
        offline={offline}
      />
      <AnalysisFilters
        query={query}
        options={options.state}
        onSet={onSet}
        onClear={() =>
          change(emptyQuery(query.scope, query.hospital, query.period))
        }
        onRetryOptions={options.retry}
        offline={offline}
      />
      <ViewPicker
        id={pickerId}
        view={view}
        onView={(v) => {
          setDownloadFailed(false);
          setView(v);
        }}
      />
      <div
        id={`${pickerId}-panel`}
        {...(desktop
          ? { role: "tabpanel", "aria-labelledby": `${pickerId}-${view}` }
          : {})}
      >
        <OneView
          view={view}
          state={read.state}
          onRetry={read.retry}
          mode={chartOrTable}
          onMode={setChartOrTable}
        />
      </div>
    </>
  );
}

/** The picked view, with the read it asked for. */
function OneView({
  view,
  state,
  ...rest
}: {
  view: ViewId;
  state: ViewRead<ViewId> | undefined;
  onRetry(): void;
  mode: ChartOrTable;
  onMode(m: ChartOrTable): void;
}) {
  switch (view) {
    case "prevalence":
      return (
        <PrevalenceView
          state={state as ViewRead<"prevalence"> | undefined}
          {...rest}
        />
      );
    case "affected":
      return (
        <AffectedView
          state={state as ViewRead<"affected"> | undefined}
          {...rest}
        />
      );
    case "co-occurring":
      return (
        <CoOccurringView
          state={state as ViewRead<"co-occurring"> | undefined}
          {...rest}
        />
      );
    case "findings":
      return (
        <FindingsView
          state={state as ViewRead<"findings"> | undefined}
          {...rest}
        />
      );
    case "quality":
      return (
        <QualityView
          state={state as ViewRead<"quality"> | undefined}
          {...rest}
        />
      );
  }
}

/** Tabs on `md` and up; a "View" select below it. */
function ViewPicker({
  id,
  view,
  onView,
}: {
  /** The tabs are `${id}-${view}`, the panel `${id}-panel`. */
  id: string;
  view: ViewId;
  onView(v: ViewId): void;
}) {
  const desktop = useIsDesktop();
  const tabs = useRef(new Map<ViewId, HTMLButtonElement>());
  if (!desktop)
    return (
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-ink-2">
        View
        <select
          value={view}
          onChange={(e) => onView(e.target.value as ViewId)}
          className={inputClass}
        >
          {VIEWS.map((v) => (
            <option key={v} value={v}>
              {VIEW_TITLE[v]}
            </option>
          ))}
        </select>
      </label>
    );
  const onKey = (e: KeyboardEvent) => {
    const at = VIEWS.indexOf(view);
    const to =
      e.key === "ArrowRight"
        ? (at + 1) % VIEWS.length
        : e.key === "ArrowLeft"
          ? (at - 1 + VIEWS.length) % VIEWS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? VIEWS.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    onView(VIEWS[to]!);
    tabs.current.get(VIEWS[to]!)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Views"
      onKeyDown={onKey}
      className="flex flex-wrap gap-1 border-b border-line"
    >
      {VIEWS.map((v) => (
        <button
          key={v}
          id={`${id}-${v}`}
          ref={(el) => {
            if (el) tabs.current.set(v, el);
            else tabs.current.delete(v);
          }}
          type="button"
          role="tab"
          aria-selected={v === view}
          aria-controls={`${id}-panel`}
          tabIndex={v === view ? 0 : -1}
          onClick={() => onView(v)}
          className={cn(
            "-mb-px min-h-11 border-b-2 px-3 text-[13.5px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep",
            v === view
              ? "border-mint-deep text-mint-deep"
              : "border-transparent text-ink-3 hover:text-ink-2",
          )}
        >
          {VIEW_TITLE[v]}
        </button>
      ))}
    </div>
  );
}
