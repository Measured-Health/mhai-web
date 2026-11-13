"use client";
import { Download } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  AnalysisFilters,
  PeriodRef,
  ViewId,
} from "@/lib/api/analysis-contract";
import {
  frameState,
  useAnalysisView,
  useFilterOptions,
} from "@/lib/analysis-queries";
import { analysisCsv, csvFilename } from "@/lib/analysis/csv";
import { defaultPeriod, pruneFilters } from "@/lib/analysis/filters";
import { problemOf } from "@/lib/analysis/states";
import { Skeleton } from "@mhai/ui/skeleton";
import { VIEWS, VIEW_TITLE } from "@/lib/analysis/labels";
import { useAuth } from "@/lib/auth/auth-context";
import { Button } from "@mhai/ui/button";
import { cn } from "@mhai/ui/cn";
import { downloadCsv } from "@mhai/ui/csv";
import { useIsDesktop } from "@mhai/ui/hooks/use-media";
import { useOnline } from "@mhai/ui/hooks/use-online";
import { MenuButton } from "../shell/menu-button";
import { TopBar } from "../shell/top-bar";
import { AffectedView } from "./affected-view";
import { CoOccurringView } from "./co-occurring-view";
import { FindingsView } from "./findings-view";
import { QualityView } from "./quality-view";
import {
  AnalysisFiltersBar,
  FILTERS_FAILED,
  type OptionsState,
} from "./analysis-filters";
import { ClearanceLine } from "./clearance-line";
import { PrevalenceView } from "./prevalence-view";
import { ProblemNotice, UpdatedAt } from "./view-frame";

/** Each view reads its own data with the filters, and fails on its own. */
export type ViewProps = { filters: AnalysisFilters };

/** The views on the page. */
const VIEW_BODY: Record<ViewId, ComponentType<ViewProps>> = {
  prevalence: PrevalenceView,
  affected: AffectedView,
  "co-occurring": CoOccurringView,
  findings: FindingsView,
  quality: QualityView,
};
const SHOWN = VIEWS;

const tabId = (base: string, v: ViewId) => `${base}-tab-${v}`;

function ViewPicker({
  view,
  onView,
  panelId,
  base,
}: {
  view: ViewId;
  onView: (v: ViewId) => void;
  panelId: string;
  base: string;
}) {
  const desktop = useIsDesktop();
  const selectId = useId();
  const refs = useRef<Partial<Record<ViewId, HTMLButtonElement | null>>>({});

  if (!desktop)
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-[12px] text-ink-3">
          View
        </label>
        <select
          id={selectId}
          value={view}
          onChange={(e) => onView(e.target.value as ViewId)}
          className="min-h-11 w-full rounded-xl border border-lilac-2 bg-white px-3 text-[13.5px] focus-visible:outline-2 focus-visible:outline-mint-deep"
        >
          {SHOWN.map((v) => (
            <option key={v} value={v}>
              {VIEW_TITLE[v]}
            </option>
          ))}
        </select>
      </div>
    );

  function move(e: KeyboardEvent, i: number) {
    const last = SHOWN.length - 1;
    const to =
      e.key === "ArrowRight"
        ? (i + 1) % SHOWN.length
        : e.key === "ArrowLeft"
          ? (i + last) % SHOWN.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    onView(SHOWN[to]);
    refs.current[SHOWN[to]]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Views"
      className="flex flex-wrap gap-1 border-b border-line"
    >
      {SHOWN.map((v, i) => (
        <button
          key={v}
          ref={(el) => {
            refs.current[v] = el;
          }}
          id={tabId(base, v)}
          type="button"
          role="tab"
          aria-selected={v === view}
          aria-controls={panelId}
          tabIndex={v === view ? 0 : -1}
          onClick={() => onView(v)}
          onKeyDown={(e) => move(e, i)}
          className={cn(
            "-mb-px min-h-11 border-b-2 px-3 text-[13.5px] font-semibold focus-visible:outline-2 focus-visible:outline-mint-deep",
            v === view
              ? "border-mint-deep text-ink"
              : "border-transparent text-ink-3 hover:text-ink-2",
          )}
        >
          {VIEW_TITLE[v]}
        </button>
      ))}
    </div>
  );
}

/** Everything but the period: what the person has chosen. */
type Chosen = Omit<AnalysisFilters, "period">;
const NONE: Chosen = {
  condition: null,
  age_band: null,
  sex: null,
  location: null,
  setting: null,
  specialty: null,
  source: null,
};
const chosenOf = (f: AnalysisFilters): Chosen => ({
  condition: f.condition,
  age_band: f.age_band,
  sex: f.sex,
  location: f.location,
  setting: f.setting,
  specialty: f.specialty,
  source: f.source,
});

export const NO_PERIOD_YET =
  "Nothing to show yet: no finished period has been prepared.";

/**
 * Analysis, on core's live routes (or the sample data in the demo): the
 * period and filters, the view picker and one view at a time. One finished
 * period at a time, chosen from the ones core lists; the filters and the
 * chosen view live here, in React state only: never in the URL, the title
 * or storage (spec §6).
 */
export function AnalysisView() {
  const [picked, setPicked] = useState<PeriodRef | null>(null);
  const [chosen, setChosen] = useState<Chosen>(NONE);
  const [view, setView] = useState<ViewId>("prevalence");
  const { user } = useAuth();
  const online = useOnline();
  const desktop = useIsDesktop();
  const base = useId();
  const panelId = useId();
  const hospital = user?.hospital ?? "Your hospital";

  // The answerable periods, and the latest finished month's lists.
  const periodsQ = useFilterOptions(null);
  const listed = periodsQ.data?.status === "ok" ? periodsQ.data.data : null;
  const period = picked ?? (listed ? defaultPeriod(listed.periods) : null);
  // The first reply already holds the latest month's lists.
  const fromFirst =
    listed !== null &&
    period !== null &&
    period.level === "month" &&
    listed.periods.month.at(-1) === period.start &&
    listed.updated_at !== null;
  const listsQ = useFilterOptions(period, period !== null && !fromFirst);
  const lists = fromFirst
    ? listed
    : listsQ.data?.status === "ok"
      ? listsQ.data.data
      : null;
  const options: OptionsState = lists
    ? { status: "ok", data: lists }
    : listsQ.isError || listsQ.data?.status === "failed"
      ? { status: "failed" }
      : { status: "loading" };
  // Only what the period lists is ever asked for; with no condition, ward or
  // clinic, specialty or source chosen, nothing needs the lists.
  const needsLists =
    chosen.condition !== null ||
    chosen.location !== null ||
    chosen.specialty !== null ||
    chosen.source !== null;
  const filters = !period
    ? null
    : lists
      ? pruneFilters({ period, ...chosen }, lists)
      : needsLists
        ? null
        : { period, ...chosen };
  const shownFilters = period ? { period, ...chosen } : null;

  // Shared with the active view's own query (same key): the file is the view on screen.
  const viewQ = useAnalysisView(view, filters);
  const shown = viewQ.data?.status === "ok" ? viewQ.data.data : null;
  const csvWhyId = useId();
  // Say why the file can't be made yet, not a silent disabled button.
  const csvState = frameState(viewQ).status;
  const csvWhy = shown
    ? null
    : csvState === "failed" || csvState === "problem"
      ? "Nothing to download until the view loads."
      : "Loading…";

  function download() {
    if (!shown || !filters) return;
    downloadCsv(
      csvFilename(view, filters),
      analysisCsv(view, shown, { hospital, filters, options: lists }),
    );
  }

  const Body = VIEW_BODY[view];
  const top = (
    <TopBar title="Analysis" sub={hospital} leading={<MenuButton />} />
  );
  const heading = (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
        {hospital}
      </p>
      <h2 className="font-display text-[40px] font-black leading-none">
        Analysis
      </h2>
      {shown && <UpdatedAt iso={shown.updated_at} className="mt-1.5" />}
    </div>
  );
  const page = (children: ReactNode) => (
    <>
      {top}
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
          {children}
        </div>
      </div>
    </>
  );

  // Before there is a period: switched off, not ready, failed, or nothing yet.
  if (!listed || !period || !shownFilters) {
    const problem = periodsQ.isError ? problemOf(periodsQ.error) : null;
    return page(
      <>
        {heading}
        {problem && problem.kind !== "failed" ? (
          <ProblemNotice
            problem={problem}
            onRetry={() => void periodsQ.refetch()}
          />
        ) : problem || periodsQ.data?.status === "failed" ? (
          <div
            role="alert"
            className="card-v3 flex flex-wrap items-center gap-3 p-5 text-[14px]"
          >
            <span className="flex-1">{FILTERS_FAILED}</span>
            <Button
              size="sm"
              variant="ghost"
              className="sm:min-h-11"
              onClick={() => void periodsQ.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : listed ? (
          <p role="status" className="card-v3 p-5 text-[14px] text-ink-2">
            {NO_PERIOD_YET}
          </p>
        ) : (
          <Skeleton className="h-72 rounded-2xl" />
        )}
      </>,
    );
  }

  return page(
    <>
      <div className="flex flex-wrap items-end gap-3">
        {heading}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            disabled={!shown}
            aria-describedby={csvWhy ? csvWhyId : undefined}
            onClick={download}
          >
            <Download aria-hidden className="size-4" />
            Download CSV
          </Button>
          {csvWhy && (
            <span id={csvWhyId} className="text-[12px] text-ink-3">
              {csvWhy}
            </span>
          )}
        </div>
      </div>
      <p className="text-[12.5px] text-ink-3">
        Counts only; groups of fewer than 5 are hidden.
      </p>
      <AnalysisFiltersBar
        filters={filters ?? shownFilters}
        periods={listed.periods}
        options={options}
        online={online}
        onPeriod={setPicked}
        // From what is on screen, so a filter the period didn't list is dropped.
        onChange={(patch) =>
          setChosen(chosenOf({ ...(filters ?? shownFilters), ...patch }))
        }
        onClear={() => setChosen(NONE)}
        onRetryOptions={() => void listsQ.refetch()}
      />
      {/* Above the drill-down area: the person's named access (Plan 11c). */}
      <ClearanceLine />
      <ViewPicker view={view} onView={setView} panelId={panelId} base={base} />
      <div
        id={panelId}
        role={desktop ? "tabpanel" : undefined}
        aria-labelledby={desktop ? tabId(base, view) : undefined}
      >
        {filters ? (
          <Body key={view} filters={filters} />
        ) : (
          <Skeleton className="h-72 rounded-2xl" />
        )}
      </div>
    </>,
  );
}
