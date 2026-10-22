"use client";
import { Download } from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import type { AnalysisFilters, ViewId } from "@/lib/api/analysis-contract";
import {
  frameState,
  useAnalysisView,
  useFilterOptions,
} from "@/lib/analysis-queries";
import { analysisCsv, csvFilename } from "@/lib/analysis/csv";
import {
  DEFAULT_PERIOD,
  customRangeProblem,
  defaultFilters,
  rangeFor,
  type PeriodId,
} from "@/lib/analysis/filters";
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
import { AnalysisFiltersBar, type OptionsState } from "./analysis-filters";
import { PrevalenceView } from "./prevalence-view";
import { UpdatedAt } from "./view-frame";

/** Each view reads its own data with the filters, and fails on its own. */
export type ViewProps = { filters: AnalysisFilters };

/** The views on the page, in order. Task 6 adds the other three here. */
const VIEW_BODY: Partial<Record<ViewId, ComponentType<ViewProps>>> = {
  prevalence: PrevalenceView,
  affected: AffectedView,
};
const SHOWN = VIEWS.filter((v) => VIEW_BODY[v]);

/** The browser's calendar day, "YYYY-MM-DD". */
function localDay(ms = Date.now()): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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

/**
 * Analysis on sample data: the filters, the view picker and one view at a
 * time. The filters and the chosen view live here, in React state only:
 * never in the URL, the title or storage (spec §6).
 */
export function AnalysisView({ today: todayProp }: { today?: string } = {}) {
  const [today] = useState(() => todayProp ?? localDay());
  const [filters, setFilters] = useState<AnalysisFilters>(() =>
    defaultFilters(today),
  );
  const [period, setPeriod] = useState<PeriodId>(DEFAULT_PERIOD);
  const [draft, setDraft] = useState(() => ({
    from: filters.from,
    to: filters.to,
  }));
  const [view, setView] = useState<ViewId>("prevalence");
  const { user } = useAuth();
  const online = useOnline();
  const desktop = useIsDesktop();
  const base = useId();
  const panelId = useId();
  const hospital = user?.hospital ?? "Your hospital";

  const optionsQ = useFilterOptions();
  const options: OptionsState = optionsQ.data
    ? optionsQ.data
    : optionsQ.isError
      ? { status: "failed" }
      : { status: "loading" };
  // Shared with the active view's own query (same key): the file is the view on screen.
  const viewQ = useAnalysisView(view, filters);
  const shown = viewQ.data?.status === "ok" ? viewQ.data.data : null;
  const csvWhyId = useId();
  // Say why the file can't be made yet, not a silent disabled button.
  const csvWhy = shown
    ? null
    : frameState(viewQ).status === "failed"
      ? "Nothing to download until the view loads."
      : "Loading…";

  function onPeriod(p: PeriodId) {
    setPeriod(p);
    if (p === "custom") {
      setDraft({ from: filters.from, to: filters.to });
      return;
    }
    setFilters((f) => ({ ...f, ...rangeFor(p, today) }));
  }

  function onDraft(d: { from: string; to: string }) {
    setDraft(d);
    if (customRangeProblem(d.from, d.to) === null)
      setFilters((f) => ({ ...f, from: d.from, to: d.to }));
  }

  function download() {
    if (!shown) return;
    downloadCsv(
      csvFilename(view, filters),
      analysisCsv(view, shown, {
        hospital,
        filters,
        options: options.status === "ok" ? options.data : null,
      }),
    );
  }

  const Body = VIEW_BODY[view]!;

  return (
    <>
      <TopBar title="Analysis" sub={hospital} leading={<MenuButton />} />
      <div className="flex-1 overflow-auto px-4 pb-10 pt-7 md:px-[26px]">
        <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[.1em] text-mint">
                {hospital}
              </p>
              <h2 className="font-display text-[40px] font-black leading-none">
                Analysis
              </h2>
              {shown && <UpdatedAt iso={shown.updated_at} className="mt-1.5" />}
            </div>
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
            filters={filters}
            period={period}
            draft={draft}
            options={options}
            online={online}
            onPeriod={onPeriod}
            onDraft={onDraft}
            onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            onClear={() =>
              setFilters((f) => ({
                ...defaultFilters(today),
                from: f.from,
                to: f.to,
              }))
            }
            onRetryOptions={() => void optionsQ.refetch()}
          />
          <ViewPicker
            view={view}
            onView={setView}
            panelId={panelId}
            base={base}
          />
          <div
            id={panelId}
            role={desktop ? "tabpanel" : undefined}
            aria-labelledby={desktop ? tabId(base, view) : undefined}
          >
            <Body key={view} filters={filters} />
          </div>
        </div>
      </div>
    </>
  );
}
